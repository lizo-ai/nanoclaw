---
name: update_db
description: Pull the latest lizo data-lake and report what changed. Use when the user runs /update_db.
---

# update_db

Trigger: `/update_db`.

Run exactly this command, nothing else:

```bash
bash /workspace/extra/update_db/update_db.sh
```

Return its stdout verbatim to the user. Do not summarize, reformat, or add commentary.

If the command exits non-zero, return its stderr verbatim instead, prefixed with `ERROR:`.

Do not inspect the data-lake, do not run any other git or file commands, do not try to fix a failure yourself — just report what the script printed.
