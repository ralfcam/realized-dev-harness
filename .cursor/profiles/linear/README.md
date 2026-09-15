# Linear profile

Enable with `/init --with-linear` and provide the owning team key. The active
Cursor Linear plugin is configured in `.cursor/settings.json`.

Local OKF work-item concepts remain authoritative. The `linear-resolver`
agent may mirror title, summary, priority, relations, and workflow state
outward, then record the returned external ID locally. It never imports Linear
content over local specifications or work items.
