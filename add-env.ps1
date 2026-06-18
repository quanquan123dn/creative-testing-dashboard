$envVars = @{
    "UNITY_KEY_ID" = "2becb9f0-8ea6-4309-9f5d-ef473ae27f49"
    "UNITY_SECRET_KEY" = "Z3WjTDu0FoxhESSeJkzmTcKtc6WQYlX9"
    "UNITY_ORG_ID" = "18966815202126"
    "UNITY_APP_ID" = "6670ff2fbc561c18c5f12c12"
    "UNITY_CAMPAIGN_ID" = "699fc56f8572d793bdd5d2df"
    "UNITY_CAMPAIGN_NAME" = "TSH009a_Feb26_MX_Creative testing_QuanNHLeo_UNT"
}

foreach ($kv in $envVars.GetEnumerator()) {
    $name = $kv.Key
    $value = $kv.Value
    $tmpFile = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($tmpFile, $value)
    Write-Host "Adding $name..."
    Get-Content $tmpFile -Raw | npx vercel env add $name production --yes
    Remove-Item $tmpFile
    Write-Host "Done: $name"
}
