---
name: extella
description: "Reuse saved programs from Extella before writing new scripts, and save programs that worked so the next thread can reuse them."
---

# Extella programs

Extella keeps programs that agents already wrote and checked. A saved program runs again without the model writing it anew.

1. Before writing a script for a self-contained task, call `extella_search` with what the script should do.
2. If a match fits (read it with `extella_get` when unsure), call `extella_run` with its parameters.
3. If nothing fits, write the script, run it, and once it gives the right answer save it with `extella_save`.

Program format for `extella_save` (Python):

```python
import csv

def csv_column_totals(path: str) -> dict:
    ...
    return {"status": "success", "value": totals}
```

- The function name equals the program name.
- Arguments are keyword arguments; the return value is a JSON-serialisable dict.
- Standard library imports work as usual.

Programs run on the user's device (see `extella_devices`), so they can read local files there. Never put secrets in program code or parameters.
