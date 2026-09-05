$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3000'

function Login($user) {
  $body = @{ usernameOrEmail = $user; password = 'test123456' } | ConvertTo-Json
  $resp = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body $body
  return $resp.data.accessToken
}

$tokenA = Login 'player_a'
$tokenB = Login 'player_b'
Write-Host "Logged in: player_a token length=$($tokenA.Length), player_b token length=$($tokenB.Length)"

# Get characters to find IDs
$charA = Invoke-RestMethod -Uri "$base/character/me" -Method Get -Headers @{ Authorization = "Bearer $tokenA" }
$charB = Invoke-RestMethod -Uri "$base/character/me" -Method Get -Headers @{ Authorization = "Bearer $tokenB" }
Write-Host "Character A: id=$($charA.data.id) nickname=$($charA.data.nickname)"
Write-Host "Character B: id=$($charB.data.id) nickname=$($charB.data.nickname)"
$idA = $charA.data.id
$idB = $charB.data.id

# --- Test 1: player_a sends pigeon to player_b ---
$sendBody = @{ toCharacterId = "$idB"; content = 'Hello from pigeon test A->B!' } | ConvertTo-Json
try {
  $send = Invoke-RestMethod -Uri "$base/pigeon/send" -Method Post -ContentType 'application/json' -Headers @{ Authorization = "Bearer $tokenA" } -Body $sendBody
  Write-Host "TEST send: status=$($send.status) toNickname=$($send.data.toNickname) delayMs=$($send.data.delayMs) delivered=$($send.data.delivered)"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "TEST send FAILED: HTTP $code $($_.ErrorDetails.Message)"
}

# --- Test 2: inbox for player_b ---
try {
  $inbox = Invoke-RestMethod -Uri "$base/pigeon/inbox" -Method Get -Headers @{ Authorization = "Bearer $tokenB" }
  Write-Host "TEST inbox B: status=$($inbox.status) count=$($inbox.data.messages.Count) unread=$($inbox.data.unreadCount)"
  if ($inbox.data.messages.Count -gt 0) {
    $msg = $inbox.data.messages[0]
    Write-Host "  latest: id=$($msg.id) from=$($msg.fromNickname) content='$($msg.content)' status=$($msg.status)"
  }
} catch {
  Write-Host "TEST inbox FAILED: $($_.ErrorDetails.Message)"
}

# --- Test 3: sent list for player_a ---
try {
  $sent = Invoke-RestMethod -Uri "$base/pigeon/sent" -Method Get -Headers @{ Authorization = "Bearer $tokenA" }
  Write-Host "TEST sent A: status=$($sent.status) count=$($sent.data.messages.Count)"
} catch {
  Write-Host "TEST sent FAILED: $($_.ErrorDetails.Message)"
}

# --- Test 4: mark read (player_b reads message) ---
try {
  $inbox = Invoke-RestMethod -Uri "$base/pigeon/inbox" -Method Get -Headers @{ Authorization = "Bearer $tokenB" }
  if ($inbox.data.messages.Count -gt 0) {
    $mid = $inbox.data.messages[0].id
    $read = Invoke-RestMethod -Uri "$base/pigeon/$mid/read" -Method Post -Headers @{ Authorization = "Bearer $tokenB" }
    Write-Host "TEST mark-read: status=$($read.status) unreadCount=$($read.data.unreadCount)"
  }
} catch {
  Write-Host "TEST mark-read FAILED: $($_.ErrorDetails.Message)"
}

# --- Test 5: rate limit (send 3 more quickly; 4th within 5 min should 429) ---
$ok = 0; $limited = 0
for ($i = 1; $i -le 4; $i++) {
  $body = @{ toCharacterId = "$idB"; content = "rate limit test $i" } | ConvertTo-Json
  try {
    Invoke-RestMethod -Uri "$base/pigeon/send" -Method Post -ContentType 'application/json' -Headers @{ Authorization = "Bearer $tokenA" } -Body $body | Out-Null
    $ok++
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 429) { $limited++ } else { Write-Host "  unexpected error HTTP $code" }
  }
}
Write-Host "TEST rate-limit: accepted=$ok rejected429=$limited (expect 2 accepted after first, then 429s)"

# --- Test 6: self-send should fail ---
try {
  $body = @{ toCharacterId = "$idA"; content = 'self send should fail' } | ConvertTo-Json
  Invoke-RestMethod -Uri "$base/pigeon/send" -Method Post -ContentType 'application/json' -Headers @{ Authorization = "Bearer $tokenA" } -Body $body | Out-Null
  Write-Host "TEST self-send: UNEXPECTED SUCCESS (should have failed)"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "TEST self-send: rejected with HTTP $code (expect 400)"
}

# --- Test 7: content too long (250 chars) should fail ---
try {
  $body = @{ toCharacterId = "$idB"; content = ('x' * 250) } | ConvertTo-Json
  Invoke-RestMethod -Uri "$base/pigeon/send" -Method Post -ContentType 'application/json' -Headers @{ Authorization = "Bearer $tokenA" } -Body $body | Out-Null
  Write-Host "TEST long-content: UNEXPECTED SUCCESS (should have failed)"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "TEST long-content: rejected with HTTP $code (expect 400)"
}

# --- Test 8: invalid recipient ---
try {
  $body = @{ toCharacterId = '999999'; content = 'nobody home' } | ConvertTo-Json
  Invoke-RestMethod -Uri "$base/pigeon/send" -Method Post -ContentType 'application/json' -Headers @{ Authorization = "Bearer $tokenA" } -Body $body | Out-Null
  Write-Host "TEST bad-recipient: UNEXPECTED SUCCESS (should have failed)"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "TEST bad-recipient: rejected with HTTP $code (expect 404)"
}

# --- Test 9: unauthenticated request ---
try {
  Invoke-RestMethod -Uri "$base/pigeon/inbox" -Method Get | Out-Null
  Write-Host "TEST no-auth: UNEXPECTED SUCCESS (should have failed)"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "TEST no-auth: rejected with HTTP $code (expect 401)"
}