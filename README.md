# Extella for bb

Gives bb agents a shared library of saved programs. An agent searches it by meaning before writing a new script, runs a matching program on one of your machines, and saves new programs that worked so later threads reuse them instead of writing them again.

## Tools the agent gets

| tool | what it does |
|---|---|
| `extella_search` | find saved programs by meaning, with similarity 0–1 |
| `extella_get` | read one program's description and code |
| `extella_run` | run a program with parameters on a device, return its result |
| `extella_save` | save a working Python function as a program; won't replace an existing one unless asked |
| `extella_devices` | list the devices connected to your account |

The `extella` skill tells the agent the order: search, reuse, and save only after a successful run.

## Install

```
bb plugin install https://github.com/<owner>/bb-plugin-extella
```

Then in bb settings → Plugins → Extella:

- **Extella API key** (required): from extella.ai. bb keeps it in a 0600 file and never sends it to the browser.
- **Extella agent id** (required): programs are searched and saved in this agent's scope.
- **Default device id**: where programs run when the agent does not name one. Leave empty and ask the agent to call `extella_devices` to see the ids.

To run programs on your own computer, install Extella Desktop there and keep it running. A run takes about 10 seconds end to end; the run itself spends no model tokens.

## What to know before installing

- bb plugins run with full trust inside the bb server process. This one only talks to the API address in its settings (`https://api.extella.ai` by default).
- A saved program runs on the device you choose with that device's file access. Read programs from other people before running them on a machine with sensitive files.
- Don't put secrets into program code or parameters: they are stored in your Extella account.

## Develop

```
npm install
npm test                                   # fake bb host, no network
EXTELLA_API_KEY=... EXTELLA_AGENT=agent_... EXTELLA_DEVICE=... node --test test/live.mjs
```

The live test saves `bbtest_word_count` into the agent's scope and runs it; delete it afterwards.

## License

MIT
