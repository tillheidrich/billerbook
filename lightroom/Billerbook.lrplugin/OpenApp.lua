local LrShell = import 'LrShell'
local LrHttp = import 'LrHttp'
local LrTasks = import 'LrTasks'
local Sync = require 'Sync'

LrTasks.startAsyncTask(function()
  if MAC_ENV then
    LrTasks.execute('open -a Billerbook')
  else
    LrHttp.openUrlInBrowser('http://127.0.0.1:' .. Sync.port())
  end
end)
