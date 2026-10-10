// RemindAni audio helper. Fades the volume of other apps (music, videos, games) to silence
// before a reminder and back to exactly where it was afterwards, through Windows Core Audio's
// per-app session volumes. The system volume and RemindAni's own sound are never touched.
//
// Started by RemindAni with stdin and stdout as pipes; one command per line:
//   duck <ms>       fade every playing app to 0 over <ms>; apps that start playing while
//                   ducked are faded down too
//   restore <ms>    fade everything back to its original volume over <ms>, then say "restored"
//   heal            put RemindAni's own slider back if it sits at silence or is muted
//                   (also done on start and on every duck)
// RemindAni's own sound is recognised three ways, so it is never faded even when one of them
// fails: the process name (--exclude), the executable in the session id (--exe), and the process
// tree (--pid: RemindAni's main process and everything it started, which includes the
// separate audio process Chromium plays all of RemindAni's sound from). If RemindAni's own mixer
// slider was left at silence (or muted), it is put back at full, because a reminder that
// can't be heard is worse than anything else this helper could do.
//
// It exits when stdin closes, restoring first if needed (RemindAni closes it after "restored",
// and the pipe also closes if RemindAni quits or crashes). While ducked,
// the original volumes are also kept in the --state file, so if this helper is ever killed
// the next run puts them back. After 20 minutes ducked it restores by itself.
//
// Written for C# 5, so it builds with the csc.exe that ships with Windows (.NET Framework 4).

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

[assembly: AssemblyTitle("RemindAni audio fader")]
[assembly: AssemblyDescription("Fades other apps' sound around RemindAni reminders")]
[assembly: AssemblyProduct("RemindAni")]
[assembly: AssemblyCompany("RemindAni")]
[assembly: AssemblyCopyright("Copyright © 2026 RemindAni")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace RemindAni.Audio
{
    // ── Core Audio COM interfaces (only the methods used, in vtable order) ──────────────────

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    class MMDeviceEnumeratorClass { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
    }

    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceCollection
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int Item(int index, out IMMDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    }

    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionManager2
    {
        // IAudioSessionManager
        [PreserveSig] int GetAudioSessionControl(IntPtr sessionGuid, int flags, out IntPtr control);
        [PreserveSig] int GetSimpleAudioVolume(IntPtr sessionGuid, int flags, out IntPtr volume);
        // IAudioSessionManager2
        [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
    }

    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionEnumerator
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int GetSession(int index, out IAudioSessionControl2 session);
    }

    [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl2
    {
        // IAudioSessionControl
        [PreserveSig] int GetState(out int state);
        [PreserveSig] int GetDisplayName(out IntPtr name);
        [PreserveSig] int SetDisplayName(IntPtr name, IntPtr context);
        [PreserveSig] int GetIconPath(out IntPtr path);
        [PreserveSig] int SetIconPath(IntPtr path, IntPtr context);
        [PreserveSig] int GetGroupingParam(out Guid param);
        [PreserveSig] int SetGroupingParam(IntPtr param, IntPtr context);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr client);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr client);
        // IAudioSessionControl2
        [PreserveSig] int GetSessionIdentifier(out IntPtr id);
        [PreserveSig] int GetSessionInstanceIdentifier(out IntPtr id);
        [PreserveSig] int GetProcessId(out int pid);
        [PreserveSig] int IsSystemSoundsSession();
    }

    [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface ISimpleAudioVolume
    {
        [PreserveSig] int SetMasterVolume(float level, ref Guid context);
        [PreserveSig] int GetMasterVolume(out float level);
        [PreserveSig] int SetMute(int mute, ref Guid context);
        [PreserveSig] int GetMute(out int mute);
    }

    // ── Process list (Toolhelp), to find RemindAni's child processes without opening them ──

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct ProcessEntry
    {
        public uint Size;
        public uint Usage;
        public uint ProcessId;
        public IntPtr DefaultHeapId;
        public uint ModuleId;
        public uint Threads;
        public uint ParentProcessId;
        public int PriorityClassBase;
        public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string ExeFile;
    }

    static class Toolhelp
    {
        const uint SnapProcess = 2;

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint processId);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, EntryPoint = "Process32FirstW")]
        static extern bool First(IntPtr snapshot, ref ProcessEntry entry);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, EntryPoint = "Process32NextW")]
        static extern bool Next(IntPtr snapshot, ref ProcessEntry entry);

        [DllImport("kernel32.dll")]
        static extern bool CloseHandle(IntPtr handle);

        // The given process and every process below it.
        public static HashSet<int> Tree(int root)
        {
            var tree = new HashSet<int>();
            if (root <= 0) return tree;
            tree.Add(root);
            var children = new Dictionary<int, List<int>>();
            IntPtr snapshot = CreateToolhelp32Snapshot(SnapProcess, 0);
            if (snapshot == IntPtr.Zero || snapshot == new IntPtr(-1)) return tree;
            try
            {
                var entry = new ProcessEntry();
                entry.Size = (uint)Marshal.SizeOf(typeof(ProcessEntry));
                for (bool more = First(snapshot, ref entry); more; more = Next(snapshot, ref entry))
                {
                    int pid = (int)entry.ProcessId;
                    int parent = (int)entry.ParentProcessId;
                    if (pid == parent) continue;
                    List<int> list;
                    if (!children.TryGetValue(parent, out list)) children[parent] = list = new List<int>();
                    list.Add(pid);
                }
            }
            finally
            {
                CloseHandle(snapshot);
            }
            var queue = new Queue<int>();
            queue.Enqueue(root);
            while (queue.Count > 0)
            {
                List<int> list;
                if (!children.TryGetValue(queue.Dequeue(), out list)) continue;
                foreach (int child in list)
                {
                    if (tree.Add(child)) queue.Enqueue(child);
                }
            }
            return tree;
        }
    }

    // ── One app's session on one output device ─────────────────────────────────────────────

    class Session
    {
        public string Key;        // instance id: unique while the session lives
        public string Identity;   // session id: stable for the app, used by the state file
        public string Process;
        public bool Own;          // RemindAni's own sound: never faded
        public ISimpleAudioVolume Volume;
        public float Original;
        public float From;
        public float To;
        public long Start;
        public long Duration;
    }

    static class Program
    {
        const int Render = 0;
        const int DeviceActive = 1;
        const int ClsctxAll = 23;
        const int SessionActive = 1;
        const long MaxDucked = 20 * 60 * 1000;
        const long Rescan = 400;

        static readonly Guid SessionManagerIid = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
        static Guid Context = new Guid("5E4F0B6A-6F3B-4C55-9C9E-2B7C2A1D0A51");

        static readonly Dictionary<string, Session> tracked = new Dictionary<string, Session>();
        static readonly ConcurrentQueue<string> commands = new ConcurrentQueue<string>();
        static readonly HashSet<string> excluded = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        static readonly List<string> ownExes = new List<string>();
        static int ownRoot;
        static HashSet<int> ownTree = new HashSet<int>();
        static readonly Stopwatch clock = Stopwatch.StartNew();
        static string stateFile;
        static string mode = "idle";   // idle | ducked | restoring
        static long duckedAt;
        static long lastScan = -Rescan;
        static bool closing;

        [MTAThread]
        static int Main(string[] args)
        {
            for (int i = 0; i + 1 < args.Length; i += 2)
            {
                if (args[i] == "--exclude") excluded.Add(args[i + 1]);
                else if (args[i] == "--exe") ownExes.Add("\\" + args[i + 1].ToLowerInvariant() + "%b");
                else if (args[i] == "--pid") int.TryParse(args[i + 1], NumberStyles.Integer, CultureInfo.InvariantCulture, out ownRoot);
                else if (args[i] == "--state") stateFile = args[i + 1];
            }
            excluded.Add(Process.GetCurrentProcess().ProcessName);

            RecoverFromStateFile();
            HealOwn();

            var reader = new Thread(ReadCommands);
            reader.IsBackground = true;
            reader.Start();
            Say("ready");

            while (true)
            {
                string line;
                while (commands.TryDequeue(out line)) Handle(line);
                long now = clock.ElapsedMilliseconds;
                if (mode == "ducked")
                {
                    if (now - lastScan >= Rescan)
                    {
                        lastScan = now;
                        Capture(now, 400);
                    }
                    if (now - duckedAt > MaxDucked) BeginRestore(now, 3000);
                }
                bool moving = Step(now);
                if (mode == "restoring" && !moving)
                {
                    tracked.Clear();
                    DeleteStateFile();
                    mode = "idle";
                    Say("restored");
                }
                // RemindAni closes stdin once it hears "restored", so the helper only ever ends
                // with everything back where it was.
                if (mode == "idle" && closing && commands.IsEmpty) return 0;
                Thread.Sleep(mode == "idle" ? 50 : 15);
            }
        }

        static void ReadCommands()
        {
            try
            {
                string line;
                while ((line = Console.In.ReadLine()) != null) commands.Enqueue(line.Trim());
            }
            catch
            {
                // A broken pipe means RemindAni is gone; treat it like a close.
            }
            commands.Enqueue("eof");
        }

        static void Handle(string line)
        {
            string[] parts = line.Split(' ');
            long ms = 0;
            if (parts.Length > 1) long.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out ms);
            ms = Math.Max(0, Math.Min(60000, ms));
            long now = clock.ElapsedMilliseconds;
            if (parts[0] == "duck")
            {
                if (mode != "ducked") duckedAt = now;
                mode = "ducked";
                lastScan = now;
                HealOwn();
                Capture(now, ms);
                // Everything already tracked (also mid-restore) heads back down from where it is.
                foreach (var s in tracked.Values) Fade(s, 0f, now, ms);
                SaveStateFile();
            }
            else if (parts[0] == "restore")
            {
                BeginRestore(now, ms);
            }
            else if (parts[0] == "heal")
            {
                HealOwn();
            }
            else if (parts[0] == "list")
            {
                // For diagnosis: every app session with its process and current volume.
                foreach (var s in Sessions(false))
                {
                    Say("session " + s.Process + " " + Get(s).ToString("0.000", CultureInfo.InvariantCulture) + (s.Own ? " own" : tracked.ContainsKey(s.Key) ? " faded" : ""));
                }
                Say("listed");
            }
            else if (parts[0] == "eof")
            {
                closing = true;
                if (mode != "idle") BeginRestore(now, 600);
            }
        }

        static void BeginRestore(long now, long ms)
        {
            if (mode == "idle") return;
            mode = "restoring";
            foreach (var s in tracked.Values) Fade(s, s.Original, now, ms);
        }

        static void Fade(Session s, float to, long now, long ms)
        {
            s.From = Get(s);
            s.To = to;
            s.Start = now;
            s.Duration = ms;
        }

        // Advances every fade; returns whether any is still moving. Fades run in a perceptual
        // space (loudness ~ amplitude^0.6) with a smoothstep, so they sound even: no sudden
        // drop at the start, no cliff at the end.
        static bool Step(long now)
        {
            bool moving = false;
            var gone = new List<string>();
            foreach (var s in tracked.Values)
            {
                if (s.Start < 0) continue;
                double k = s.Duration <= 0 ? 1 : Math.Min(1.0, (now - s.Start) / (double)s.Duration);
                double e = k * k * (3 - 2 * k);
                double pf = Math.Pow(s.From, 0.6);
                double pt = Math.Pow(s.To, 0.6);
                float level = (float)Math.Pow(pf + (pt - pf) * e, 1 / 0.6);
                if (!Set(s, level)) gone.Add(s.Key);
                if (k < 1) moving = true;
                else s.Start = -1;
            }
            foreach (var key in gone) tracked.Remove(key);
            return moving;
        }

        // Finds apps that are playing and not yet tracked, remembers their volume and fades
        // them down.
        static void Capture(long now, long ms)
        {
            bool added = false;
            foreach (var found in Sessions(true))
            {
                if (found.Own || tracked.ContainsKey(found.Key)) continue;
                found.Original = Get(found);
                tracked[found.Key] = found;
                Fade(found, 0f, now, ms);
                added = true;
            }
            if (added) SaveStateFile();
        }

        static IEnumerable<Session> Sessions(bool activeOnly)
        {
            var list = new List<Session>();
            ownTree = Toolhelp.Tree(ownRoot);
            IMMDeviceEnumerator devices;
            try
            {
                devices = (IMMDeviceEnumerator)new MMDeviceEnumeratorClass();
            }
            catch
            {
                return list;
            }
            IMMDeviceCollection endpoints;
            int count;
            if (devices.EnumAudioEndpoints(Render, DeviceActive, out endpoints) != 0 || endpoints.GetCount(out count) != 0) return list;
            for (int d = 0; d < count; d++)
            {
                try
                {
                    IMMDevice device;
                    if (endpoints.Item(d, out device) != 0) continue;
                    object manager;
                    Guid iid = SessionManagerIid;
                    if (device.Activate(ref iid, ClsctxAll, IntPtr.Zero, out manager) != 0) continue;
                    IAudioSessionEnumerator sessions;
                    if (((IAudioSessionManager2)manager).GetSessionEnumerator(out sessions) != 0) continue;
                    int n;
                    sessions.GetCount(out n);
                    for (int i = 0; i < n; i++)
                    {
                        IAudioSessionControl2 control;
                        if (sessions.GetSession(i, out control) != 0 || control == null) continue;
                        Session s = Describe(control, activeOnly);
                        if (s != null) list.Add(s);
                    }
                }
                catch
                {
                    // A device can disappear mid-scan (headphones unplugged); skip it.
                }
            }
            return list;
        }

        static Session Describe(IAudioSessionControl2 control, bool activeOnly)
        {
            int state;
            if (control.GetState(out state) != 0) return null;
            if (activeOnly && state != SessionActive) return null;
            if (control.IsSystemSoundsSession() == 0) return null;
            int pid;
            if (control.GetProcessId(out pid) != 0 || pid == 0) return null;
            string process;
            try
            {
                process = Process.GetProcessById(pid).ProcessName;
            }
            catch
            {
                return null;
            }
            var volume = control as ISimpleAudioVolume;
            if (volume == null) return null;
            string key = Text(control.GetSessionInstanceIdentifier);
            string identity = Text(control.GetSessionIdentifier);
            if (key == null) return null;
            var s = new Session();
            s.Key = key;
            s.Identity = identity ?? key;
            s.Process = process;
            s.Own = excluded.Contains(process) || ownTree.Contains(pid) || IsOwnExe(s.Identity) || IsOwnExe(key);
            s.Volume = volume;
            s.Start = -1;
            return s;
        }

        static bool IsOwnExe(string id)
        {
            if (id == null) return false;
            string lower = id.ToLowerInvariant();
            foreach (string exe in ownExes)
            {
                if (lower.Contains(exe)) return true;
            }
            return false;
        }

        // RemindAni's own slider at silence or muted (left there by anything, including an older
        // version of this helper) means reminders can't be heard: put it back.
        static void HealOwn()
        {
            foreach (var s in Sessions(false))
            {
                if (!s.Own) continue;
                bool fixedIt = false;
                try
                {
                    int muted;
                    if (s.Volume.GetMute(out muted) == 0 && muted != 0 && s.Volume.SetMute(0, ref Context) == 0) fixedIt = true;
                }
                catch
                {
                }
                float level;
                bool read = false;
                try
                {
                    read = s.Volume.GetMasterVolume(out level) == 0;
                }
                catch
                {
                    level = 1f;
                }
                if (read && level < 0.02f && Set(s, 1f)) fixedIt = true;
                if (fixedIt) Say("own sound back on (" + s.Process + ")");
            }
        }

        delegate int StringGetter(out IntPtr value);

        static string Text(StringGetter getter)
        {
            IntPtr p;
            if (getter(out p) != 0 || p == IntPtr.Zero) return null;
            try
            {
                return Marshal.PtrToStringUni(p);
            }
            finally
            {
                Marshal.FreeCoTaskMem(p);
            }
        }

        static float Get(Session s)
        {
            float level;
            try
            {
                if (s.Volume.GetMasterVolume(out level) == 0) return level;
            }
            catch
            {
            }
            return s.Original;
        }

        static bool Set(Session s, float level)
        {
            try
            {
                return s.Volume.SetMasterVolume(Math.Max(0f, Math.Min(1f, level)), ref Context) == 0;
            }
            catch
            {
                return false;
            }
        }

        // ── State file: original volumes while ducked ───────────────────────────────────────

        static void SaveStateFile()
        {
            if (stateFile == null) return;
            try
            {
                var text = new StringBuilder();
                foreach (var s in tracked.Values)
                {
                    text.Append(s.Original.ToString("R", CultureInfo.InvariantCulture)).Append('\t').Append(s.Identity).Append('\n');
                }
                File.WriteAllText(stateFile, text.ToString());
            }
            catch
            {
            }
        }

        static void DeleteStateFile()
        {
            if (stateFile == null) return;
            try
            {
                File.Delete(stateFile);
            }
            catch
            {
            }
        }

        // A previous run was killed while ducked: put back any app still sitting at silence.
        static void RecoverFromStateFile()
        {
            if (stateFile == null || !File.Exists(stateFile)) return;
            try
            {
                var saved = new Dictionary<string, float>();
                foreach (var line in File.ReadAllLines(stateFile))
                {
                    int tab = line.IndexOf('\t');
                    float level;
                    if (tab > 0 && float.TryParse(line.Substring(0, tab), NumberStyles.Float, CultureInfo.InvariantCulture, out level))
                    {
                        saved[line.Substring(tab + 1)] = level;
                    }
                }
                foreach (var s in Sessions(false))
                {
                    float level;
                    if (saved.TryGetValue(s.Identity, out level) && Get(s) < 0.001f) Set(s, level);
                }
                Say("recovered " + saved.Count.ToString(CultureInfo.InvariantCulture));
            }
            catch
            {
            }
            DeleteStateFile();
        }

        static void Say(string text)
        {
            try
            {
                Console.Out.WriteLine(text);
                Console.Out.Flush();
            }
            catch
            {
            }
        }
    }
}
