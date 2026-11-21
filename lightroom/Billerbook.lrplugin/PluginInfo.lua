local LrView = import 'LrView'
local LrPrefs = import 'LrPrefs'
local LrHttp = import 'LrHttp'

return {
  sectionsForTopOfDialog = function(f, _)
    local prefs = LrPrefs.prefsForPlugin()
    local bind = LrView.bind
    return {
      {
        title = 'Billerbook',
        bind_to_object = prefs,
        f:row { f:static_text { title = 'Keeps a collection per photo book edition under “Billerbook” in the Collections panel.', fill_horizontal = 1 } },
        f:row { f:checkbox { title = 'Sync automatically while Billerbook is open', value = bind 'autoSync' } },
        f:row { f:checkbox { title = 'Also show photos that are still missing from each edition', value = bind 'missingCollections' } },
        f:row {
          f:static_text { title = 'Port (empty = automatic):' },
          f:edit_field { value = bind 'port', width_in_chars = 6 },
        },
        f:row { f:static_text { title = bind { key = 'lastSync', transform = function(v) return 'Last sync: ' .. (v or 'never') end }, fill_horizontal = 1 } },
        f:row { f:push_button { title = 'Website', action = function() LrHttp.openUrlInBrowser('https://billerbook.heidrich-digital.de') end } },
      },
    }
  end,
}
