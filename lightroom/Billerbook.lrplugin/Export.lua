-- Exports the photos of a Billerbook project as full-resolution JPEGs (with all Lightroom edits)
-- into the project's export folder. Billerbook then shows them sharp and prints from them.
-- Only photos that are new or edited since their last export are rendered again.
-- Writes files only; the catalog is not changed.
local LrApplication = import 'LrApplication'
local LrBinding = import 'LrBinding'
local LrDialogs = import 'LrDialogs'
local LrExportSession = import 'LrExportSession'
local LrFileUtils = import 'LrFileUtils'
local LrFunctionContext = import 'LrFunctionContext'
local LrHttp = import 'LrHttp'
local LrPathUtils = import 'LrPathUtils'
local LrPrefs = import 'LrPrefs'
local LrProgressScope = import 'LrProgressScope'
local LrTasks = import 'LrTasks'
local LrView = import 'LrView'
local LrLogger = import 'LrLogger'
local Sync = require 'Sync'

local log = LrLogger('Billerbook')
log:enable('logfile')

local function baseName(photo)
  local name = photo:getFormattedMetadata('fileName') or ''
  return (string.gsub(name, '%.[^%.]*$', ''))
end

-- Photos of one project: in a book (any edition) or the whole selection (book + missing).
local function photosOf(catalog, project, scope)
  local out, seen = {}, {}
  local function add(uuid)
    if seen[uuid] then return end
    seen[uuid] = true
    local ph = catalog:findPhotoByUuid(uuid)
    if ph then out[#out + 1] = ph end
  end
  for _, e in ipairs(project.editions) do
    for _, id in ipairs(e.ids) do add(id) end
    if scope == 'all' then for _, id in ipairs(e.missing) do add(id) end end
  end
  return out
end

-- Skip a photo whose JPEG exists and is newer than its last edit in Lightroom.
local function needsExport(photo, folder)
  local file = LrPathUtils.child(folder, baseName(photo) .. '.jpg')
  if not LrFileUtils.exists(file) then return true end
  local attrs = LrFileUtils.fileAttributes(file) or {}
  local fileTime = attrs.fileModificationDate
  local editTime = photo:getRawMetadata('lastEditTime')
  if not fileTime or not editTime then return true end
  return editTime > fileTime
end

local function exportSettings(folder)
  return {
    LR_export_destinationType = 'specificFolder',
    LR_export_destinationPathPrefix = folder,
    LR_export_useSubfolder = false,
    LR_collisionHandling = 'overwrite',
    LR_reimportExportedPhoto = false,
    LR_renamingTokensOn = false,
    LR_extensionCase = 'lowercase',
    LR_format = 'JPEG',
    LR_jpeg_quality = 0.95,
    LR_jpeg_useLimitSize = false,
    LR_export_colorSpace = 'sRGB',
    LR_export_bitDepth = 8,
    LR_size_doConstrain = false,
    LR_size_resolution = 300,
    LR_size_resolutionUnits = 'inch',
    LR_outputSharpeningOn = false, -- Billerbook sharpens for the print size itself
    LR_minimizeEmbeddedMetadata = false, -- keeps captions and capture time
    LR_removeLocationMetadata = false,
    LR_metadata_keywordOptions = 'lightroomHierarchical',
    LR_useWatermark = false,
    LR_includeVideoFiles = false,
  }
end

local function notifyBillerbook(projectId)
  local body = '{"project":"' .. string.gsub(projectId, '[^%w_-]', '') .. '"}'
  LrHttp.post('http://127.0.0.1:' .. Sync.port() .. '/api/lightroom/exported', body,
    { { field = 'Content-Type', value = 'application/json' } }, 'POST', 5)
end

local function ask(projects)
  return LrFunctionContext.callWithContext('billerbookExportDialog', function(context)
    local f = LrView.osFactory()
    local prefs = LrPrefs.prefsForPlugin()
    local props = LrBinding.makePropertyTable(context)
    local items = {}
    for i, p in ipairs(projects) do items[#items + 1] = { title = p.name, value = i } end
    props.project = 1
    for i, p in ipairs(projects) do if p.id == prefs.lastExportProject then props.project = i end end
    props.scope = prefs.lastExportScope or 'all'
    local bind = LrView.bind
    local contents = f:column {
      bind_to_object = props,
      spacing = f:control_spacing(),
      f:row {
        f:static_text { title = LOC '$$$/Billerbook/Export/Project=Photo book:', width = LrView.share 'label' },
        f:popup_menu { items = items, value = bind 'project', width_in_chars = 34 },
      },
      f:row {
        f:static_text { title = LOC '$$$/Billerbook/Export/Scope=Photos:', width = LrView.share 'label' },
        f:column {
          f:radio_button { title = LOC '$$$/Billerbook/Export/ScopeAll=All photos of the project’s collections (recommended at the start)', value = bind 'scope', checked_value = 'all' },
          f:radio_button { title = LOC '$$$/Billerbook/Export/ScopeBook=Only photos placed in the book', value = bind 'scope', checked_value = 'book' },
        },
      },
      f:row {
        f:static_text { title = LOC '$$$/Billerbook/Export/Folder=Folder:', width = LrView.share 'label' },
        f:static_text { title = bind { key = 'project', transform = function(v) return projects[v] and projects[v].folder or '' end }, width_in_chars = 46, height_in_lines = 2 },
      },
      f:static_text {
        title = LOC '$$$/Billerbook/Export/Hint=Full-size JPEG with your edits, sRGB, quality 95. Photos already exported and not edited since are skipped.',
        width_in_chars = 60, height_in_lines = 2,
      },
    }
    local r = LrDialogs.presentModalDialog {
      title = LOC '$$$/Billerbook/Export/Title=Export print files for Billerbook',
      contents = contents,
      actionVerb = LOC '$$$/Billerbook/Export/Go=Export',
    }
    if r ~= 'ok' then return nil end
    prefs.lastExportProject = projects[props.project].id
    prefs.lastExportScope = props.scope
    return projects[props.project], props.scope
  end)
end

LrTasks.startAsyncTask(function()
  local data, err = Sync.fetch()
  if not data then
    LrDialogs.message('Billerbook', err, 'warning')
    return
  end
  if not data.projects or #data.projects == 0 then
    LrDialogs.message('Billerbook', LOC '$$$/Billerbook/Export/NoProject=No Billerbook project uses this Lightroom catalog yet. In Billerbook choose Sources › Lightroom catalog and tick your collection, then try again.', 'info')
    return
  end
  local project, scope = ask(data.projects)
  if not project then return end

  local catalog = LrApplication.activeCatalog()
  local all = photosOf(catalog, project, scope)
  local todo = {}
  LrFileUtils.createAllDirectories(project.folder)
  for _, ph in ipairs(all) do
    if not ph:getRawMetadata('isVideo') and needsExport(ph, project.folder) then todo[#todo + 1] = ph end
  end
  if #todo == 0 then
    notifyBillerbook(project.id)
    LrDialogs.showBezel(LOC('$$$/Billerbook/Export/UpToDate=All ^1 photos are up to date.', #all), 3)
    return
  end

  local failed = {}
  LrFunctionContext.callWithContext('billerbookExport', function(context)
    local progress = LrProgressScope { title = LOC('$$$/Billerbook/Export/Progress=Billerbook: exporting ^1 photos', #todo), functionContext = context }
    local session = LrExportSession { photosToExport = todo, exportSettings = exportSettings(project.folder) }
    local n = 0
    for _, rendition in session:renditions { stopIfCanceled = true, progressScope = progress } do
      local ok, msg = rendition:waitForRender()
      if not ok then failed[#failed + 1] = (rendition.photo:getFormattedMetadata('fileName') or '?') .. ': ' .. tostring(msg) end
      n = n + 1
      -- Let the editor pick up exports in batches while the rest renders.
      if n % 50 == 0 then LrTasks.pcall(notifyBillerbook, project.id) end
      if progress:isCanceled() then break end
    end
    progress:done()
  end)
  LrTasks.pcall(notifyBillerbook, project.id)
  log:info('exported ' .. (#todo - #failed) .. ' of ' .. #todo .. ' to ' .. project.folder)

  if #failed > 0 then
    local list = table.concat(failed, '\n', 1, math.min(#failed, 12))
    if #failed > 12 then list = list .. '\n…' end
    LrDialogs.message('Billerbook',
      LOC('$$$/Billerbook/Export/Failed=^1 of ^2 photos could not be exported. Usually the original is on a drive that is not connected.', #failed, #todo) .. '\n\n' .. list,
      'warning')
  else
    LrDialogs.showBezel(LOC('$$$/Billerbook/Export/Done=Billerbook: ^1 photos exported.', #todo), 4)
  end
end)
