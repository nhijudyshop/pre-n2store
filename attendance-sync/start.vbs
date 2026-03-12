Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
If sh.CurrentDirectory = "" Then WScript.Quit 1
If Not CreateObject("Scripting.FileSystemObject").FolderExists(sh.CurrentDirectory & "\node_modules") Then WScript.Quit 1
sh.Run "cmd /c node index.js >> logs\service.log 2>&1", 0, False
