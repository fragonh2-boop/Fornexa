alter table private.review_access_tokens enable row level security;

comment on table private.review_access_tokens is
  'Server-only hashed review tokens. RLS is enabled as defense in depth; access is mediated by private.fornexa_validate_review_token_impl().';
