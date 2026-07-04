# API Surface Map

This map converts mockup and requirement intent into `API_CONVENTIONS.md` operation names. It is a planning surface for leads and reviewers; implementation agents should still receive only `README.md` plus their assigned step plan.

## Foundation And Session

```text
get_health
get_me
create_user
user/auth/login
user/auth/logout
user/auth/signup
user/auth/confirm_verification
user/auth/request_password_reset
user/auth/confirm_password_reset
user/auth/resend_verification
```

## Reference Data

```text
get_search_options
list_care_types
list_features
list_languages
list_regions
list_price_units
```

## Public Marketplace

```text
get_homepage
search_facilities
list_facilities
get_facility
list_facility_reviews
list_facility_recommendations
list_articles
get_article
create_analytics_event
batch_create_analytics_events
```

## Family Workflows

```text
list_saved_facilities
create_saved_facility
delete_saved_facility
get_account_dashboard
list_tour_requests
create_tour_request
create_tour_request_confirmation
create_tour_request_decline
create_tour_request_cancellation
create_tour_request_attendance
create_tour_request_no_show
get_review_eligibility
create_review
list_notifications
update_notification_read_state
batch_update_notifications_read_state
```

## Provider Onboarding And Facility Manager

```text
get_provider_onboarding_options
create_listing_submission
update_listing_submission_draft
get_listing_submission
create_media_upload
complete_media_upload
list_managed_facilities
get_facility_manager_dashboard
update_facility_availability
update_facility_manager_listing_fields
list_facility_manager_tour_requests
create_facility_review_response
create_review_flag
```

## Admin, Moderation, CMS

```text
list_admin_listing_submissions
get_admin_listing_submission
create_listing_submission_approval
create_listing_submission_rejection
update_admin_facility
create_facility_disablement
create_facility_enablement
create_licence_verification
delete_licence_verification
list_review_flags
create_review_flag_resolution
list_audit_events
list_cms_articles
get_cms_article
create_cms_article
update_cms_article
create_cms_article_publication
create_cms_article_unpublication
```

## Decision Tools

```text
get_assessment_schema
create_assessment_result
get_latest_assessment_result
delete_latest_assessment_result
list_assessment_matches
create_cost_estimate
get_cost_calculator_policy
list_shortlists
get_shortlist
create_shortlist
update_shortlist
delete_shortlist
create_shortlist_facility
delete_shortlist_facility
create_shortlist_note
create_shortlist_reaction
create_shortlist_share
create_shortlist_import
```

## Background And Operations

These are not public browser APIs unless explicitly exposed as admin diagnostics.

```text
process_outbox_batch
process_email_delivery_webhook
process_media_callback
process_search_projection_sync
process_daily_analytics_rollup
process_availability_staleness_sweep
process_notification_fanout
```

## Resource Tags

Use these tags for server cache and frontend invalidation metadata:

```text
account
analytics
article
assessment
audit
auth_session
cms_page
cost_estimate
facility
facility_manager
listing_submission
media_asset
notification
reference
review
review_flag
shortlist
tour_request
user
```
