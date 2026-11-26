-- Reads which photos Billerbook uses and mirrors that into collections:
--   Billerbook › <project> › <edition>             photos placed in that edition
--   Billerbook › <project> › <edition> – missing   photos from the project's Lightroom
--                                                   collections that are not in the edition yet
-- Billerbook only reads the catalog; this plug-in is the only part that writes, and only these collections.
-- Export.lua additionally writes full-resolution JPEGs into the project's export folder (never into the catalog).
local LrApplication = import 'LrApplication'
local LrHttp = import 'LrHttp'
local LrPathUtils = import 'LrPathUtils'
local LrFileUtils = import 'LrFileUtils'
local LrPrefs = import 'LrPrefs'
local LrLogger = import 'LrLogger'

local log = LrLogger('Billerbook')
log:enable('logfile')

local Sync = {}

local function dataDir()
  local home = LrPathUtils.getStandardFilePath('home')
  if WIN_ENV then
    return LrPathUtils.child(LrPathUtils.getStandardFilePath('appData'), 'Billerbook')
  end
  return LrPathUtils.child(LrPathUtils.child(LrPathUtils.child(home, 'Library'), 'Application Support'), 'Billerbook')
end

-- Port of the running Billerbook app (written to server.json when it starts).
function Sync.port()
  local prefs = LrPrefs.prefsForPlugin()
  if prefs.port and tonumber(prefs.port) then return tonumber(prefs.port) end
  local f = LrPathUtils.child(dataDir(), 'server.json')
  if LrFileUtils.exists(f) then
    local txt = LrFileUtils.readFile(f) or ''
    local p = string.match(txt, '"port"%s*:%s*(%d+)')
    if p then return tonumber(p) end
  end
  return 4580
end

function Sync.fetch()
  local body, headers = LrHttp.get('http://127.0.0.1:' .. Sync.port() .. '/api/lightroom/usage.txt', nil, 5)
  if not body or (headers and headers.status and headers.status ~= 200) then
    return nil, 'Billerbook is not running. Open the Billerbook app and try again.'
  end
  local hash, editions, projects, cur, proj = nil, {}, {}, nil, nil
  for line in string.gmatch(body, '[^\n]+') do
    local kind, a, b, c = string.match(line, '^(%a)\t([^\t]*)\t?([^\t]*)\t?([^\t]*)$')
    if kind == 'H' then hash = a
    elseif kind == 'P' then proj = { id = a, name = b, folder = c, editions = {} }; projects[#projects + 1] = proj
    elseif kind == 'E' then
      cur = { project = a, edition = b, id = c, ids = {}, files = {}, missing = {} }; editions[#editions + 1] = cur
      if proj and proj.name == a then proj.editions[#proj.editions + 1] = cur end
    elseif cur and kind == 'I' then cur.ids[#cur.ids + 1] = a
    elseif cur and kind == 'F' then cur.files[#cur.files + 1] = a
    elseif cur and kind == 'M' then cur.missing[#cur.missing + 1] = a
    end
  end
  return { hash = hash, editions = editions, projects = projects }
end

local function photosFor(catalog, uuids, files)
  local out, seen = {}, {}
  for _, id in ipairs(uuids or {}) do
    local ph = catalog:findPhotoByUuid(id)
    if ph and not seen[ph] then seen[ph] = true; out[#out + 1] = ph end
  end
  for _, path in ipairs(files or {}) do
    local ph = catalog:findPhotoByPath(path)
    if ph and not seen[ph] then seen[ph] = true; out[#out + 1] = ph end
  end
  return out
end

-- Returns a short summary string.
function Sync.run(data)
  local catalog = LrApplication.activeCatalog()
  local prefs = LrPrefs.prefsForPlugin()
  local withMissing = prefs.missingCollections ~= false
  local total, editionsDone = 0, 0
  catalog:withWriteAccessDo('Billerbook: sync book collections', function()
    local root = catalog:createCollectionSet('Billerbook', nil, true)
    for _, e in ipairs(data.editions) do
      local set = catalog:createCollectionSet(e.project ~= '' and e.project or 'Photo book', root, true)
      local coll = catalog:createCollection(e.edition ~= '' and e.edition or 'Edition', set, true)
      local photos = photosFor(catalog, e.ids, e.files)
      coll:removeAllPhotos()
      if #photos > 0 then coll:addPhotos(photos) end
      total = total + #photos
      editionsDone = editionsDone + 1
      if withMissing and #e.missing > 0 then
        local miss = catalog:createCollection((e.edition ~= '' and e.edition or 'Edition') .. ' – missing', set, true)
        local mp = photosFor(catalog, e.missing, nil)
        miss:removeAllPhotos()
        if #mp > 0 then miss:addPhotos(mp) end
      end
    end
  end, { timeout = 30 })
  prefs.lastHash = data.hash
  prefs.lastSync = os.date('%Y-%m-%d %H:%M')
  log:info('synced ' .. editionsDone .. ' editions, ' .. total .. ' photos')
  return string.format('%d editions, %d photos in book collections.', editionsDone, total)
end

return Sync
