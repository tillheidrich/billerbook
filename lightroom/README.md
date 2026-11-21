# Billerbook plug-in for Lightroom Classic

Shows in Lightroom which photos are in your Billerbook photo books.

After installing (Mac app: *File › Install Lightroom Classic Plug-in…*, or copy `Billerbook.lrplugin` into Lightroom's `Modules` folder, or add it in *File › Plug-in Manager*), the Collections panel gets:

- **Billerbook › project › edition**: photos placed in that edition
- **Billerbook › project › edition – missing**: photos from the project's Lightroom collections that are not in that edition

The plug-in asks the running Billerbook app (`/api/lightroom/usage.txt` on 127.0.0.1) every 20 seconds and updates the collections when something changed. Matching uses the Lightroom photo id (for photos that came from the catalog) and the file path (for photos from folders).

It writes nothing but these collections. Settings in the Plug-in Manager: automatic sync on/off, the "missing" collections on/off, and a fixed port if needed. Manual sync: *Library › Plug-in Extras › Sync book collections now*.
