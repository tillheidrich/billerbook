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
    { title = 'Sync book collections now', file = 'SyncNow.lua' },
    { title = 'Open Billerbook', file = 'OpenApp.lua' },
  },
  LrExportMenuItems = {
    { title = 'Billerbook: sync book collections now', file = 'SyncNow.lua' },
  },
  VERSION = { major = 0, minor = 10, revision = 0, build = 1 },
}
