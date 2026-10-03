$ErrorActionPreference = 'Stop'
# Read-only access query: no ControlService, StartService, identity or permission changes.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class CatalogServiceAccessQuery {
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr OpenSCManager(IntPtr machine, IntPtr database, uint desiredAccess);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr OpenService(IntPtr manager, string name, uint desiredAccess);
  [DllImport("advapi32.dll", SetLastError=true)]
  public static extern bool CloseServiceHandle(IntPtr handle);
}
'@
$manager = [CatalogServiceAccessQuery]::OpenSCManager([IntPtr]::Zero, [IntPtr]::Zero, 1)
if ($manager -eq [IntPtr]::Zero) {
  $managerError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  [ordered]@{ service = 'MelisaWhatsAppCrmGateway'; readOnly = $true; identityChanged = $false; controlActionPerformed = $false; managerQueryAllowed = $false; win32Code = $managerError } | ConvertTo-Json
  exit 1
}
try {
  $result = foreach ($access in @(@{name='query';mask=4}, @{name='start';mask=16}, @{name='stop';mask=32})) {
    $handle = [CatalogServiceAccessQuery]::OpenService($manager, 'MelisaWhatsAppCrmGateway', [uint32]$access.mask)
    $errorCode = if ($handle -eq [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::GetLastWin32Error() } else { 0 }
    if ($handle -ne [IntPtr]::Zero) { [void][CatalogServiceAccessQuery]::CloseServiceHandle($handle) }
    [ordered]@{ operation = $access.name; allowed = $errorCode -eq 0; win32Code = $errorCode }
  }
  [ordered]@{ service = 'MelisaWhatsAppCrmGateway'; readOnly = $true; identityChanged = $false; controlActionPerformed = $false; access = $result } | ConvertTo-Json -Depth 5
} finally { [void][CatalogServiceAccessQuery]::CloseServiceHandle($manager) }
