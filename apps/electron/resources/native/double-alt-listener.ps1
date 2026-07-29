Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class DoubleAltHook {
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_KEYUP = 0x0101;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int WM_SYSKEYUP = 0x0105;
    private const int VK_LMENU = 0xA4;
    private const int VK_RMENU = 0xA5;

    private static IntPtr hookId = IntPtr.Zero;
    private static LowLevelKeyboardProc proc = HookCallback;
    private static bool leftAltDown = false;
    private static bool rightAltDown = false;
    private static bool fired = false;

    public static int Run() {
        hookId = SetHook(proc);
        if (hookId == IntPtr.Zero) {
            Console.WriteLine("STATUS unavailable");
            Console.Out.Flush();
            return 3;
        }

        Console.WriteLine("STATUS ready");
        Console.Out.Flush();

        MSG msg;
        while (GetMessage(out msg, IntPtr.Zero, 0, 0) != 0) {}
        UnhookWindowsHookEx(hookId);
        return 0;
    }

    private static IntPtr SetHook(LowLevelKeyboardProc proc) {
        using (Process currentProcess = Process.GetCurrentProcess())
        using (ProcessModule currentModule = currentProcess.MainModule) {
            return SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(currentModule.ModuleName), 0);
        }
    }

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) {
            int message = wParam.ToInt32();
            int vkCode = Marshal.ReadInt32(lParam);
            bool isDown = message == WM_KEYDOWN || message == WM_SYSKEYDOWN;
            bool isUp = message == WM_KEYUP || message == WM_SYSKEYUP;

            if (vkCode == VK_LMENU && (isDown || isUp)) {
                leftAltDown = isDown;
            } else if (vkCode == VK_RMENU && (isDown || isUp)) {
                rightAltDown = isDown;
            }

            if (leftAltDown && rightAltDown && isDown && !fired) {
                fired = true;
                Console.WriteLine("TRIGGER");
                Console.Out.Flush();
            }

            if (!leftAltDown || !rightAltDown) {
                fired = false;
            }
        }

        return CallNextHookEx(hookId, nCode, wParam, lParam);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG {
        public IntPtr hwnd;
        public uint message;
        public UIntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public int pt_x;
        public int pt_y;
    }

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("user32.dll")]
    private static extern sbyte GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);
}
"@

[Environment]::Exit([DoubleAltHook]::Run())
