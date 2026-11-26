-- Billerbook plug-in for Lightroom Classic: shows which photos are in your Billerbook photo books.
return {
  LrSdkVersion = 10.0,
  LrSdkMinimumVersion = 6.0,
  LrToolkitIdentifier = 'de.heidrich-digital.billerbook',
  LrPluginName = 'Billerbook',
  LrPluginInfoUrl = 'https://billerbook.heidrich-digital.de',
  LrInitPlugin = 'Init.lua',
  LrPluginInfoProvider = 'PluginInfo.lua',
  LrLibraryMenuItems = {
    { title = LOC '$$$/Billerbook/Menu/Export=Export print files for Billerbook…', file = 'Export.lua' },
    { title = LOC '$$$/Billerbook/Menu/Sync=Sync book collections now', file = 'SyncNow.lua' },
    { title = LOC '$$$/Billerbook/Menu/Open=Open Billerbook', file = 'OpenApp.lua' },
  },
  LrExportMenuItems = {
    { title = LOC '$$$/Billerbook/Menu/ExportFile=Billerbook: export print files…', file = 'Export.lua' },
    { title = LOC '$$$/Billerbook/Menu/SyncFile=Billerbook: sync book collections now', file = 'SyncNow.lua' },
  },
  VERSION = { major = 0, minor = 12, revision = 0, build = 1 },
}
