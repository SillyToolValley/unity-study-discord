// Task Scheduler entry point: runs run-local.cmd without a console window and
// returns its exit code, so a failed run shows as failed in Task Scheduler.
// (conhost --headless hides the window but always reports 0.)
// Action: wscript.exe //B //Nologo //E:jscript "<repo>\scripts\run-local-hidden.js"
var shell = new ActiveXObject('WScript.Shell');
var dir = WScript.ScriptFullName.replace(/\\[^\\]+$/, '');
var cmd = WScript.Arguments.length ? WScript.Arguments(0) : dir + '\\run-local.cmd';
WScript.Quit(shell.Run('cmd.exe /c "' + cmd + '"', 0, true));
