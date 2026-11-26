<?php
/**
 * Plugin Name: Opndrive - refresh the blog on publish
 * Description: Tells the Opndrive site to drop its cached copy of the blog when a post is published, updated, unpublished or deleted.
 * Version: 1.0.0
 *
 * Needs two constants in wp-config.php:
 *
 *   define( 'OPNDRIVE_SITE_URL', 'https://your-opndrive-site.example' );
 *   define( 'OPNDRIVE_REVALIDATE_SECRET', 'the same value as REVALIDATE_SECRET on the site' );
 *
 * The secret lives in wp-config.php and never in this file, so this file can
 * be shared and versioned as it is. Without both constants it does nothing.
 *
 * The request is sent without waiting for an answer, so saving a post is never
 * slowed down or blocked by the site being unreachable.
 */

defined( 'ABSPATH' ) || exit;

/**
 * Sends one refresh request for a post.
 *
 * @param WP_Post $post The post that changed.
 */
function opndrive_request_revalidate( WP_Post $post ): void {
	if ( ! defined( 'OPNDRIVE_SITE_URL' ) || ! defined( 'OPNDRIVE_REVALIDATE_SECRET' ) ) {
		return;
	}

	$slug = $post->post_name;
	if ( '' === $slug ) {
		return;
	}

	wp_remote_post(
		trailingslashit( OPNDRIVE_SITE_URL ) . 'api/revalidate',
		array(
			'blocking' => false,
			'timeout'  => 3,
			'headers'  => array(
				'Content-Type'       => 'application/json',
				'x-revalidate-token' => OPNDRIVE_REVALIDATE_SECRET,
			),
			'body'     => wp_json_encode(
				array(
					'type' => 'post',
					'slug' => $slug,
				)
			),
		)
	);
}

/**
 * Every save goes through here, with the status before and after. A change
 * matters to readers when the post is published now or was published before:
 * publishing, updating a published post, unpublishing and trashing.
 */
add_action(
	'transition_post_status',
	function ( string $new_status, string $old_status, WP_Post $post ): void {
		if ( 'post' !== $post->post_type ) {
			return;
		}
		if ( wp_is_post_revision( $post ) || wp_is_post_autosave( $post ) ) {
			return;
		}
		if ( 'publish' !== $new_status && 'publish' !== $old_status ) {
			return;
		}

		opndrive_request_revalidate( $post );
	},
	10,
	3
);

/** A published post deleted outright, without going through the trash. */
add_action(
	'before_delete_post',
	function ( int $post_id, WP_Post $post ): void {
		if ( 'post' === $post->post_type && 'publish' === $post->post_status ) {
			opndrive_request_revalidate( $post );
		}
	},
	10,
	2
);
