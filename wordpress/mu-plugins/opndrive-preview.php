<?php
/**
 * Plugin Name: Opndrive - draft previews
 * Description: Points WordPress's Preview button at the Opndrive site, and adds a read-only role that lets the site read drafts through WPGraphQL.
 * Version: 1.0.0
 *
 * Needs two constants in wp-config.php:
 *
 *   define( 'OPNDRIVE_SITE_URL', 'https://your-opndrive-site.example' );
 *   define( 'OPNDRIVE_PREVIEW_SECRET', 'the same value as BLOG_PREVIEW_SECRET on the site' );
 *
 * The secret lives in wp-config.php and never in this file. Without both
 * constants the Preview button is left as WordPress made it.
 *
 * THE ROLE
 *
 * "Opndrive previewer" has exactly two capabilities: `read`, which every
 * logged-in user has, and `opndrive_preview_drafts`, which this file defines.
 * It cannot edit, publish, delete or upload anything, and cannot manage users.
 *
 * WPGraphQL on its own would need two editing capabilities to show someone
 * else's draft: `edit_posts`, to admit that the draft exists, and
 * `edit_others_posts`, to show its content (WPGraphQL\Model\Post::is_private()
 * and ::get_restricted_cap()). Instead of granting those, the two filters below
 * tell WPGraphQL that a user with `opndrive_preview_drafts` may read posts that
 * are drafts, pending review or scheduled. That is read access, through
 * WPGraphQL only: WordPress itself still refuses this user every edit.
 *
 * What this does not show: changes WordPress keeps in an autosave rather than
 * in the post itself. That is the case for unsaved edits to someone else's
 * draft, and for any change to a post that is already published. Reading those
 * goes through WPGraphQL's preview context, which requires `edit_post` on the
 * post, an editing capability. Click "Save draft" before "Preview" and the
 * preview shows the draft as saved.
 *
 * THE PREVIEW LINK
 *
 * The Preview button opens /api/preview on the site with the post ID, an
 * expiry an hour away, and an HMAC-SHA256 signature of both. The site checks
 * the signature, shows the draft to that browser only, and never indexes it.
 * A leaked link stops working when it expires.
 */

defined( 'ABSPATH' ) || exit;

const OPNDRIVE_PREVIEW_CAPABILITY = 'opndrive_preview_drafts';

const OPNDRIVE_PREVIEW_ROLE = 'opndrive_previewer';

/** How long a preview link works, in seconds. */
const OPNDRIVE_PREVIEW_LINK_LIFETIME = HOUR_IN_SECONDS;

/** Statuses the previewer may read. Not `private` and not `trash`. */
const OPNDRIVE_PREVIEW_STATUSES = array( 'draft', 'pending', 'future' );

add_action(
	'init',
	function (): void {
		if ( null === get_role( OPNDRIVE_PREVIEW_ROLE ) ) {
			add_role(
				OPNDRIVE_PREVIEW_ROLE,
				'Opndrive previewer',
				array(
					'read'                      => true,
					OPNDRIVE_PREVIEW_CAPABILITY => true,
				)
			);
		}
	}
);

/**
 * Whether WPGraphQL is being asked for a post the current user may read only
 * because of this plugin.
 *
 * @param mixed $model_name The WPGraphQL model's name.
 * @param mixed $data       The object the model wraps.
 */
function opndrive_previewer_may_read( $model_name, $data ): bool {
	return 'PostObject' === $model_name
		&& $data instanceof WP_Post
		&& 'post' === $data->post_type
		&& in_array( $data->post_status, OPNDRIVE_PREVIEW_STATUSES, true )
		&& current_user_can( OPNDRIVE_PREVIEW_CAPABILITY );
}

/** The draft is not private to this user... */
add_filter(
	'graphql_data_is_private',
	function ( $is_private, $model_name, $data ) {
		return opndrive_previewer_may_read( $model_name, $data ) ? false : $is_private;
	},
	10,
	3
);

/** ...and the capability for reading it in full is the one this role has. */
add_filter(
	'graphql_restricted_data_cap',
	function ( $capability, $model_name, $data ) {
		return opndrive_previewer_may_read( $model_name, $data ) ? OPNDRIVE_PREVIEW_CAPABILITY : $capability;
	},
	10,
	3
);

/** The Preview button, for people who can edit the post, goes to the site. */
add_filter(
	'preview_post_link',
	function ( string $link, WP_Post $post ): string {
		if ( ! defined( 'OPNDRIVE_SITE_URL' ) || ! defined( 'OPNDRIVE_PREVIEW_SECRET' ) ) {
			return $link;
		}
		if ( 'post' !== $post->post_type || ! current_user_can( 'edit_post', $post->ID ) ) {
			return $link;
		}

		$expires   = time() + OPNDRIVE_PREVIEW_LINK_LIFETIME;
		$signature = hash_hmac( 'sha256', $post->ID . '.' . $expires, OPNDRIVE_PREVIEW_SECRET );

		return add_query_arg(
			array(
				'id'  => $post->ID,
				'exp' => $expires,
				'sig' => $signature,
			),
			trailingslashit( OPNDRIVE_SITE_URL ) . 'api/preview'
		);
	},
	10,
	2
);
