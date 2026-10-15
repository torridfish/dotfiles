# mdcat-cached.yazi

Local fork of [GrzegorzKozub/mdcat](https://github.com/GrzegorzKozub/mdcat.yazi) (rev 7b7380a): caches mdcat output per Yazi instance and keeps ANSI colours.

Preview markdown files in [yazi](https://github.com/sxyazi/yazi) with [mdcat](https://github.com/swsnr/mdcat).

Install this plugin with:

```bash
ya pack --add GrzegorzKozub/mdcat
```

Then set it up in your `yazi.toml` file by adding:

```toml
[plugin]
prepend_previewers = [
  { name = "*.md", run = "mdcat" },
]
```
