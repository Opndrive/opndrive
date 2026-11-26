# WordPress plugins for the Opndrive blog

The blog at `/blog` reads posts from a headless WordPress over WPGraphQL. These
two must-use plugins are the WordPress half of two features. Neither holds a
secret: both read their settings from `wp-config.php`.

| Plugin                               | What it does                                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `mu-plugins/opndrive-revalidate.php` | When a post is published, updated, unpublished or deleted, asks the site to drop its cached blog, so the change shows at once      |
| `mu-plugins/opndrive-preview.php`    | Points the Preview button at the site's draft preview, and adds a read-only "Opndrive previewer" role the site uses to read drafts |

Both need WPGraphQL. The preview needs WordPress 5.6 or later, for application
passwords.

## Install

1. **Make two secrets**, each at least 32 random characters. For example:

   ```bash
   openssl rand -hex 32
   ```

2. **Add them to `wp-config.php`**, above the line that says
   `/* That's all, stop editing! */`:

   ```php
   define( 'OPNDRIVE_SITE_URL', 'https://your-opndrive-site.example' );
   define( 'OPNDRIVE_REVALIDATE_SECRET', 'first secret' );
   define( 'OPNDRIVE_PREVIEW_SECRET', 'second secret' );
   ```

   PHP files are run, not served, so the web never sees what `wp-config.php`
   holds, and it is not part of any plugin, so the secrets stay out of every
   file you might share or version.

3. **Copy both plugins** into `wp-content/mu-plugins/` (create the folder if it
   does not exist). Must-use plugins load on their own; there is nothing to
   activate. They appear under Plugins → Must-Use.

4. **Create the previewer.** Users → Add New: any username, any email you
   control, role **Opndrive previewer**. Then open that user's profile, and
   under Application Passwords add one named after your site. Copy it: it is
   shown once.

5. **Set the site's environment** (on Vercel, Production only; then redeploy):

   | Variable                         | Value                                          |
   | -------------------------------- | ---------------------------------------------- |
   | `REVALIDATE_SECRET`              | the same value as `OPNDRIVE_REVALIDATE_SECRET` |
   | `BLOG_PREVIEW_SECRET`            | the same value as `OPNDRIVE_PREVIEW_SECRET`    |
   | `WORDPRESS_PREVIEW_USER`         | the previewer's username                       |
   | `WORDPRESS_PREVIEW_APP_PASSWORD` | the application password from step 4           |

## Check it

- **Revalidate:** edit a published post, change a word, Update. Reload the post
  on the site: the change is there. In Vercel's logs, `POST /api/revalidate`
  answered 200.
- **Preview:** open a draft, click Save draft, then Preview. The site opens the
  draft with a "Preview" banner. Open the same address in a private window: it
  is a 404. Click Exit preview to leave.

## What the previewer can do

Exactly two capabilities: `read`, which every logged-in user has, and
`opndrive_preview_drafts`. It cannot edit, publish, delete or upload anything,
and cannot manage users. WPGraphQL would normally require two editing
capabilities to show another user's draft (`edit_posts` and
`edit_others_posts`); the plugin instead lets this one role read drafts, pending
and scheduled posts through WPGraphQL, and nothing else.

The one thing it cannot show: changes WordPress has put in an autosave instead
of the post. That covers unsaved edits to a draft someone else wrote, and edits
to an already published post. Reading those needs `edit_post` on the post, which
is an editing capability, so the plugin does not grant it. Save the draft before
previewing.
