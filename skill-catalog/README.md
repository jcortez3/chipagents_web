# jcortez3
# Skill catalog (temporary)

This folder is the shared skill catalog shown in the **🧩 Skills → Catalog**
tab of ChipAgents Web. It is temporary until a permanent shared location
(network folder or Git repo) is chosen. When that location is chosen, update
`paste-proxy/skill-catalog.json`.

## Layout

One sub-folder per skill, each with a `SKILL.md` at its top:

```
skill-catalog/
  my-skill/
    SKILL.md        <- starts with --- name: my-skill / description: ... ---
    scripts/...     (optional)
    references/...  (optional)
```

`name` must be lowercase letters, digits, `-` or `_` (max 64 characters),
and `description` must not be empty. Symlinks are not allowed.

## Adding a skill

- In ChipAgents Web: **🧩 Skills → Installed → 📤 Publish** copies one of your
  installed skills here. An older copy with the same name is kept in Backups.
- Or copy the skill folder in by hand.

## Sharing

- Share this whole folder (zip it and post it on Teams), or a single skill
  from **🧩 Skills → Installed → ⬇ Export .zip**.
- The receiver drops the `.zip` into **🧩 Skills → Import**, or extracts it
  into their own `skill-catalog/` folder.
