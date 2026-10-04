using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace LICBookEduLauncher
{
    class Program
    {
        private static HttpListener _listener;
        private static bool _isRunning = true;
        private static string _baseDir;
        private static string _activeUrl;
        private static readonly Dictionary<string, string> MimeTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { ".html", "text/html; charset=utf-8" },
            { ".htm", "text/html; charset=utf-8" },
            { ".css", "text/css; charset=utf-8" },
            { ".js", "application/javascript; charset=utf-8" },
            { ".mjs", "application/javascript; charset=utf-8" },
            { ".json", "application/json; charset=utf-8" },
            { ".svg", "image/svg+xml" },
            { ".png", "image/png" },
            { ".jpg", "image/jpeg" },
            { ".jpeg", "image/jpeg" },
            { ".gif", "image/gif" },
            { ".webp", "image/webp" },
            { ".ico", "image/x-icon" },
            { ".woff", "font/woff" },
            { ".woff2", "font/woff2" },
            { ".ttf", "font/ttf" },
            { ".otf", "font/otf" },
            { ".eot", "application/vnd.ms-fontobject" },
            { ".pdf", "application/pdf" },
            { ".epub", "application/epub+zip" },
            { ".wasm", "application/wasm" },
            { ".mp3", "audio/mpeg" },
            { ".wav", "audio/wav" },
            { ".txt", "text/plain; charset=utf-8" },
            { ".md", "text/plain; charset=utf-8" }
        };

        [STAThread]
        static void Main(string[] args)
        {
            bool isNewInstance;
            using (Mutex mutex = new Mutex(true, "Global\\LICBookEdu_Portable_Server_Mutex", out isNewInstance))
            {
                _baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

                if (!isNewInstance)
                {
                    // An instance is already running; open Edge to the running server URL and exit
                    string runningUrl = ReadActiveUrl();
                    LaunchEdge(runningUrl);
                    return;
                }

                // Start HTTP Server with dynamic port allocation (tries 8080 first, then 8081..8099)
                if (!StartServer())
                {
                    try
                    {
                        MessageBox.Show(
                            "No se pudo iniciar el servidor web local de LICBookEdu.\nLos puertos entre el 8080 y el 8099 se encuentran ocupados por otras aplicaciones.",
                            "LICBook Edu - Puerto Ocupado",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Error
                        );
                    }
                    catch { }
                    return;
                }

                // Save active URL so secondary instances know which port was bound
                SaveActiveUrl(_activeUrl);

                // Launch Edge in standalone app mode
                Process edgeProcess = LaunchEdge(_activeUrl);

                // Wait for the user to close Edge, then terminate the server
                if (edgeProcess != null)
                {
                    try
                    {
                        edgeProcess.WaitForExit();
                    }
                    catch
                    {
                        // Ignore any waiting exceptions
                    }
                }

                // Shutdown server cleanly
                StopServer();
            }
        }

        private static bool StartServer()
        {
            const int startPort = 8080;
            const int endPort = 8099;

            for (int port = startPort; port <= endPort; port++)
            {
                // Try localhost first
                if (TryBindPort("localhost", port))
                {
                    return true;
                }

                // Fallback to 127.0.0.1 for this port
                if (TryBindPort("127.0.0.1", port))
                {
                    return true;
                }
            }

            return false;
        }

        private static bool TryBindPort(string host, int port)
        {
            string url = string.Format("http://{0}:{1}/", host, port);
            try
            {
                _listener = new HttpListener();
                _listener.Prefixes.Add(url);
                _listener.Start();

                _activeUrl = url;

                Thread listenerThread = new Thread(ListenLoop);
                listenerThread.IsBackground = true;
                listenerThread.Start();
                return true;
            }
            catch
            {
                if (_listener != null)
                {
                    try
                    {
                        _listener.Close();
                    }
                    catch { }
                    _listener = null;
                }
                return false;
            }
        }

        private static void StopServer()
        {
            _isRunning = false;
            ClearActiveUrl();
            try
            {
                if (_listener != null)
                {
                    _listener.Stop();
                    _listener.Close();
                }
            }
            catch
            {
                // Ignore shutdown exceptions
            }
        }

        private static string GetUrlLockFilePath()
        {
            string appData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "LICBookEdu");
            try
            {
                if (!Directory.Exists(appData))
                {
                    Directory.CreateDirectory(appData);
                }
            }
            catch { }
            return Path.Combine(appData, "active_server.lock");
        }

        private static void SaveActiveUrl(string url)
        {
            try
            {
                File.WriteAllText(GetUrlLockFilePath(), url);
            }
            catch { }
        }

        private static string ReadActiveUrl()
        {
            try
            {
                string path = GetUrlLockFilePath();
                if (File.Exists(path))
                {
                    string url = File.ReadAllText(path).Trim();
                    if (!string.IsNullOrEmpty(url) && url.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
                    {
                        return url;
                    }
                }
            }
            catch { }
            return "http://localhost:8080/";
        }

        private static void ClearActiveUrl()
        {
            try
            {
                string path = GetUrlLockFilePath();
                if (File.Exists(path))
                {
                    File.Delete(path);
                }
            }
            catch { }
        }

        private static void ListenLoop()
        {
            while (_isRunning && _listener != null && _listener.IsListening)
            {
                try
                {
                    HttpListenerContext context = _listener.GetContext();
                    ThreadPool.QueueUserWorkItem(ProcessRequest, context);
                }
                catch (HttpListenerException)
                {
                    break;
                }
                catch (ObjectDisposedException)
                {
                    break;
                }
                catch
                {
                    // Transient listener error, continue if running
                }
            }
        }

        private static void ProcessRequest(object state)
        {
            HttpListenerContext context = (HttpListenerContext)state;
            try
            {
                string rawUrl = context.Request.Url.AbsolutePath;
                string decodedUrl = Uri.UnescapeDataString(rawUrl);

                if (string.IsNullOrEmpty(decodedUrl) || decodedUrl == "/")
                {
                    decodedUrl = "/index.html";
                }

                string relativePath = decodedUrl.TrimStart('/', '\\').Replace('/', Path.DirectorySeparatorChar);
                string fullPath = Path.GetFullPath(Path.Combine(_baseDir, relativePath));

                // Path traversal protection
                if (!fullPath.StartsWith(_baseDir, StringComparison.OrdinalIgnoreCase))
                {
                    context.Response.StatusCode = 403;
                    byte[] msg = System.Text.Encoding.UTF8.GetBytes("403 Prohibido");
                    context.Response.ContentType = "text/plain; charset=utf-8";
                    context.Response.ContentLength64 = msg.Length;
                    context.Response.OutputStream.Write(msg, 0, msg.Length);
                    context.Response.Close();
                    return;
                }

                // If path is a directory, look for index.html
                if (Directory.Exists(fullPath))
                {
                    fullPath = Path.Combine(fullPath, "index.html");
                }

                if (!File.Exists(fullPath))
                {
                    context.Response.StatusCode = 404;
                    byte[] msg = System.Text.Encoding.UTF8.GetBytes("404 No Encontrado");
                    context.Response.ContentType = "text/plain; charset=utf-8";
                    context.Response.ContentLength64 = msg.Length;
                    context.Response.OutputStream.Write(msg, 0, msg.Length);
                    context.Response.Close();
                    return;
                }

                string extension = Path.GetExtension(fullPath);
                string mimeType;
                if (!MimeTypes.TryGetValue(extension, out mimeType))
                {
                    mimeType = "application/octet-stream";
                }

                context.Response.ContentType = mimeType;
                context.Response.AddHeader("Cache-Control", "no-cache, no-store, must-revalidate");
                context.Response.AddHeader("Access-Control-Allow-Origin", "*");

                using (FileStream fs = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    context.Response.ContentLength64 = fs.Length;
                    byte[] buffer = new byte[64 * 1024];
                    int bytesRead;
                    while ((bytesRead = fs.Read(buffer, 0, buffer.Length)) > 0)
                    {
                        context.Response.OutputStream.Write(buffer, 0, bytesRead);
                    }
                }

                context.Response.StatusCode = 200;
                context.Response.Close();
            }
            catch
            {
                try
                {
                    context.Response.Abort();
                }
                catch { }
            }
        }

        private static Process LaunchEdge(string targetUrl)
        {
            if (string.IsNullOrEmpty(targetUrl))
            {
                targetUrl = "http://localhost:8080/";
            }

            string edgePath = FindEdgePath();
            string profileDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "LICBookEdu", "EdgeProfile");

            try
            {
                if (!Directory.Exists(profileDir))
                {
                    Directory.CreateDirectory(profileDir);
                }
            }
            catch { }

            ProcessStartInfo psi = new ProcessStartInfo();
            if (!string.IsNullOrEmpty(edgePath) && File.Exists(edgePath))
            {
                psi.FileName = edgePath;
                // --app gives the native window without browser address bar / tabs
                // --user-data-dir keeps Edge isolated and keeps IndexedDB/storage persistent
                // --disable-background-mode ensures Edge completely exits when window is closed
                psi.Arguments = string.Format(
                    "--app={0} --user-data-dir=\"{1}\" --no-first-run --no-default-browser-check --disable-background-mode",
                    targetUrl,
                    profileDir
                );
            }
            else
            {
                // Fallback to default system browser if Edge is not found
                psi.FileName = targetUrl;
                psi.UseShellExecute = true;
            }

            try
            {
                return Process.Start(psi);
            }
            catch
            {
                // In case of any launch error, fallback to shell execute URL
                try
                {
                    return Process.Start(targetUrl);
                }
                catch
                {
                    return null;
                }
            }
        }

        private static string FindEdgePath()
        {
            string[] possiblePaths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Edge\Application\msedge.exe")
            };

            foreach (string path in possiblePaths)
            {
                if (File.Exists(path))
                {
                    return path;
                }
            }

            return null;
        }
    }
}
