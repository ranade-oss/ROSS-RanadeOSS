-- Extend the encrypted per-user API-key provider allowlist for direct Grok and Kimi access.

alter table public.user_api_keys
    drop constraint if exists user_api_keys_provider_check;

alter table public.user_api_keys
    add constraint user_api_keys_provider_check
    check (provider in (
        'claude',
        'gemini',
        'openai',
        'xai',
        'moonshot',
        'openrouter',
        'courtlistener',
        'canlii'
    ));
