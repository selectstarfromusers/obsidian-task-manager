# Tasks

A clean, minimal task board for [Obsidian](https://obsidian.md). Create customizable buckets, group tasks by any frontmatter property, and track tasks inline from any note in your vault.

---

## Views

| Mode | Description |
|------|-------------|
| **Board** | All buckets displayed as side-by-side columns with tasks flowing vertically. Best for wide screens and quick triage. |
| **Focus** | One bucket at a time, full-width, with tabs along the top to switch between buckets. Best for deep work and mobile. |

## Features

- **Customizable buckets** -- Create as many buckets as you need with any name. Use them for an Eisenhower matrix, GTD stages, sprint columns, or any workflow that fits your thinking.
- **Secondary grouping** -- Group tasks within each bucket by any frontmatter property (account, project, team, etc.). Groups appear as subtle, semi-transparent frames inside the bucket.
- **Inline task tracking** -- Add `#task` to any checkbox in any note to surface it on the board. Assign a secondary group with a wikilink: `- [ ] Send docs [[Bio-Techne]] #task`
- **Bidirectional sync** -- Check off a task on the board or in the source note; both stay in sync.
- **Drag-and-drop** -- Move tasks between buckets or reorder them within a bucket.
- **Completion animation** -- Checked tasks get a strikethrough, fade out, and collapse smoothly.
- **Frameless design** -- Tasks render as clean text with checkboxes. No card borders, no visual noise.
- **"+ Add a task" button** -- Create tasks directly from the board. The secondary group field autocompletes from existing groups.
- **Accessibility** -- Full ARIA roles and keyboard navigation. Enter/Space to toggle a task, Tab to move between elements.
- **Mobile-friendly** -- Larger touch targets on touch devices for comfortable use on phones and tablets.

## Usage

### Creating tasks

There are three ways to add tasks:

1. **Inline** -- In any note, write a checkbox line with the `#task` tag:
   ```markdown
   - [ ] Review quarterly report [[Finance]] #task
   ```
   The task appears on the board automatically.

2. **From the board** -- Click **+ Add a task** at the bottom of any bucket. Type the task text, optionally pick a secondary group, and press Enter.

3. **Stub files** -- Create a markdown file in the configured task folder with the appropriate frontmatter. The plugin picks it up on the next scan.

### How buckets work

Each task belongs to exactly one bucket. The bucket is stored as a frontmatter property on the task (or its parent note for inline tasks). You define your buckets in settings -- their names, order, and colors are entirely up to you. Drag a task from one bucket to another to reassign it.

### How secondary grouping works

When enabled, tasks inside each bucket are collected under group headings based on a frontmatter property you choose (for example, `account` or `project`). Each group is wrapped in a subtle semi-transparent frame. Groups are collapsible so you can hide what you are not working on. Tasks that have no value for the grouping property appear under an "Ungrouped" heading.

## Configuration

Open **Settings > Community Plugins > Tasks** to configure the plugin.

### General

| Setting | Description | Default |
|---------|-------------|---------|
| Task folder | Folder where new tasks created from the board are saved | `tasks/` |
| Inline tag | Tag used to identify inline tasks across your vault | `#task` |
| Default view | View mode when opening the board | Board |

### Buckets

| Setting | Description |
|---------|-------------|
| Add bucket | Create a new bucket with a custom name |
| Rename | Change a bucket's display name |
| Reorder | Drag buckets to change their column order |
| Delete | Remove a bucket (tasks in it become unassigned) |

### Secondary Grouping

| Setting | Description | Default |
|---------|-------------|---------|
| Enable grouping | Toggle secondary grouping on or off | Off |
| Property name | Frontmatter property used to group tasks | `account` |
| Collapsible groups | Allow collapsing/expanding individual groups | On |

### Display

| Setting | Description | Default |
|---------|-------------|---------|
| Show due dates | Display due date badges on tasks | On |
| Show task age | Display how long a task has been open | Off |
| Source icons | Show a small icon linking back to the source note | On |
| Compact mode | Reduce padding and font size for denser boards | Off |
| Completion behavior | What happens after a task is checked off (fade, archive, or remove) | Fade |

## Installation

### Community plugins (recommended)

1. Open **Settings > Community Plugins > Browse**.
2. Search for **Tasks**.
3. Click **Install**, then **Enable**.

### Manual

1. Download the latest release from the [GitHub releases page](https://github.com/artmalanok/obsidian-tasks/releases).
2. Extract the files into your vault's `.obsidian/plugins/obsidian-tasks/` folder.
3. Reload Obsidian and enable the plugin under **Settings > Community Plugins**.

## License

[MIT](LICENSE)
