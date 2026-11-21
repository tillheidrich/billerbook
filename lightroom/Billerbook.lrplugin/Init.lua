-- Background sync: every 20 seconds, if Billerbook runs and something changed, update the collections.
local LrTasks = import 'LrTasks'
local LrPrefs = import 'LrPrefs'
local Sync = require 'Sync'

local prefs = LrPrefs.prefsForPlugin()
if prefs.autoSync == nil then prefs.autoSync = true end
if prefs.missingCollections == nil then prefs.missingCollections = true end

_G.BillerbookRunning = true
LrTasks.startAsyncTask(function()
  LrTasks.sleep(10)
  while _G.BillerbookRunning do
    if prefs.autoSync then
      local ok, data = LrTasks.pcall(Sync.fetch)
      if ok and data and data.hash and data.hash ~= prefs.lastHash then
        LrTasks.pcall(Sync.run, data)
      end
    end
    LrTasks.sleep(20)
  end
end)
