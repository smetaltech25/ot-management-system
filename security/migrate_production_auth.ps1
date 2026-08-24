param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRef
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$linkedProjectFile = Join-Path $PSScriptRoot '..\supabase\.temp\project-ref'
if (-not (Test-Path -LiteralPath $linkedProjectFile)) {
    throw 'Supabase project is not linked. Run supabase link first.'
}

$linkedProjectRef = (Get-Content -LiteralPath $linkedProjectFile -Raw).Trim()
if ($linkedProjectRef -ne $ProjectRef) {
    throw "Linked project mismatch. Expected $ProjectRef but found $linkedProjectRef"
}

$baseUrl = "https://$ProjectRef.supabase.co"
$keys = supabase projects api-keys --project-ref $ProjectRef --output json | ConvertFrom-Json
$serviceKey = ($keys | Where-Object { $_.name -eq 'service_role' } | Select-Object -First 1).api_key
if ([string]::IsNullOrWhiteSpace($serviceKey)) {
    throw 'Service role key was not found.'
}

$headers = @{
    apikey = $serviceKey
    Authorization = "Bearer $serviceKey"
}

function Get-Sha256Hex([string]$Value) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hash = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Value))
        return -join ($hash | ForEach-Object { $_.ToString('x2') })
    } finally {
        $sha.Dispose()
    }
}

function Get-AuthEmail([string]$Username) {
    $normalized = $Username.Trim().ToLowerInvariant()
    if ($normalized -match '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
        return $normalized
    }
    return "oms-$((Get-Sha256Hex $normalized).Substring(0, 40))@auth.smetaltech.test"
}

function Get-AuthPassword([string]$Password) {
    if ($Password -match '^\d{4}$') {
        return Get-Sha256Hex "oms-legacy-v1:$Password"
    }

    $byteLength = [System.Text.Encoding]::UTF8.GetByteCount($Password)
    if ($Password.Length -lt 6 -or $byteLength -gt 72) {
        throw 'A non-legacy password must contain at least 6 characters and no more than 72 bytes.'
    }
    return $Password
}

$profileResponse = Invoke-RestMethod -Method Get `
    -Uri "$baseUrl/rest/v1/users?select=id,username,password,fullname,auth_user_id&order=id.asc" `
    -Headers $headers
$profiles = @($profileResponse | ForEach-Object { $_ })

if ($profiles.Count -eq 0) {
    throw 'No Production profiles were returned.'
}

$pendingProfiles = @($profiles | Where-Object { [string]::IsNullOrWhiteSpace($_.auth_user_id) })
$created = New-Object System.Collections.Generic.List[object]

try {
    foreach ($profile in $pendingProfiles) {
        $username = [string]$profile.username
        $legacyPassword = [string]$profile.password
        if ([string]::IsNullOrWhiteSpace($username) -or [string]::IsNullOrWhiteSpace($legacyPassword)) {
            throw "Profile $($profile.id) has no username or password."
        }

        $authEmail = Get-AuthEmail $username
        $authPassword = Get-AuthPassword $legacyPassword
        $authBody = @{
            email = $authEmail
            password = $authPassword
            email_confirm = $true
            user_metadata = @{
                username = $username
                fullname = [string]$profile.fullname
                password_migration = if ($legacyPassword -match '^\d{4}$') { 'legacy-4-digit-v1' } else { 'direct-v1' }
            }
        } | ConvertTo-Json -Depth 5

        $authUser = Invoke-RestMethod -Method Post `
            -Uri "$baseUrl/auth/v1/admin/users" `
            -Headers $headers `
            -ContentType 'application/json; charset=utf-8' `
            -Body $authBody

        if ([string]::IsNullOrWhiteSpace($authUser.id)) {
            throw "Auth user creation returned no id for profile $($profile.id)."
        }

        try {
            $profileId = [uri]::EscapeDataString([string]$profile.id)
            $updateHeaders = @{
                apikey = $serviceKey
                Authorization = "Bearer $serviceKey"
                Prefer = 'return=minimal'
            }
            Invoke-RestMethod -Method Patch `
                -Uri "$baseUrl/rest/v1/users?id=eq.$profileId" `
                -Headers $updateHeaders `
                -ContentType 'application/json' `
                -Body (@{ auth_user_id = $authUser.id } | ConvertTo-Json) | Out-Null
        } catch {
            Invoke-RestMethod -Method Delete -Uri "$baseUrl/auth/v1/admin/users/$($authUser.id)" -Headers $headers | Out-Null
            throw
        }

        $created.Add([pscustomobject]@{
            profile_id = [string]$profile.id
            auth_user_id = [string]$authUser.id
        })
    }

    [pscustomobject]@{
        total_profiles = $profiles.Count
        already_linked = $profiles.Count - $pendingProfiles.Count
        newly_linked = $created.Count
        legacy_four_digit_migrated = @($pendingProfiles | Where-Object { $_.password -match '^\d{4}$' }).Count
    } | ConvertTo-Json -Compress
} catch {
    foreach ($item in $created) {
        try {
            $profileId = [uri]::EscapeDataString($item.profile_id)
            Invoke-RestMethod -Method Patch `
                -Uri "$baseUrl/rest/v1/users?id=eq.$profileId" `
                -Headers $headers `
                -ContentType 'application/json' `
                -Body '{"auth_user_id":null}' | Out-Null
            Invoke-RestMethod -Method Delete `
                -Uri "$baseUrl/auth/v1/admin/users/$($item.auth_user_id)" `
                -Headers $headers | Out-Null
        } catch {
            Write-Warning "Rollback needs manual verification for profile $($item.profile_id)."
        }
    }
    throw
}
