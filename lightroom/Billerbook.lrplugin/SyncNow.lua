local LrTasks = import 'LrTasks'
local LrDialogs = import 'LrDialogs'
local Sync = require 'Sync'

LrTasks.startAsyncTask(function()
  local data, err = Sync.fetch()
  if not data then
    LrDialogs.message('Billerbook', err, 'warning')
    return
  end
  local ok, res = LrTasks.pcall(Sync.run, data)
  if ok then
    LrDialogs.showBezel('Billerbook: ' .. res, 3)
  else
    LrDialogs.message('Billerbook', 'Sync failed: ' .. tostring(res), 'critical')
  end
end)
