#!/usr/bin/env python3
"""Record Agent IC demo video using ffmpeg x11grab with scene-by-scene automation.

This script records the browser at 1920x1080@30fps and automatically clicks through
the demo beats to create a dynamic video with 8-10 scene transitions.

Usage:
    python3 record_demo.py

Requirements:
    - ffmpeg
    - A running browser at http://localhost:3000
    - xdotool (for window manipulation)
"""

import subprocess
import time
import sys
import os
import signal

# Recording config
OUTPUT_PATH = "/run/media/vdubrov/NVMe-Storage/Hackathon Submission #1/demo-out/agent-ic-demo-v2.mp4"
RESOLUTION = "1920x1080"
FPS = 30
DURATION = 130  # seconds

# Scene timing (seconds from start)
SCENES = [
    {"time": 0, "action": "hero", "duration": 12, "desc": "Hero + receipt strip"},
    {"time": 12, "action": "mission", "duration": 10, "desc": "Select mission"},
    {"time": 22, "action": "evaluate", "duration": 8, "desc": "Run evaluation"},
    {"time": 30, "action": "spend", "duration": 12, "desc": "Approve spend envelope"},
    {"time": 42, "action": "blocked", "duration": 10, "desc": "Trigger blocked action"},
    {"time": 52, "action": "evidence", "duration": 15, "desc": "Import evidence"},
    {"time": 67, "action": "scroll_memo", "duration": 10, "desc": "Show decision memo"},
    {"time": 77, "action": "playbook", "duration": 12, "desc": "Show saved playbook"},
    {"time": 89, "action": "audit", "duration": 10, "desc": "Show audit record"},
    {"time": 99, "action": "scroll_top", "duration": 15, "desc": "Return to hero"},
    {"time": 114, "action": "pause", "duration": 16, "desc": "Final pause"},
]

def get_browser_window_id():
    """Find the Chrome window ID."""
    try:
        result = subprocess.run(
            ["xdotool", "search", "--class", "chrome"],
            capture_output=True, text=True, timeout=5
        )
        ids = [x for x in result.stdout.strip().split("\n") if x]
        return ids[0] if ids else None
    except Exception:
        return None

def click_at(x, y, window_id=None):
    """Click at screen coordinates."""
    if window_id:
        subprocess.run(["xdotool", "click", "--window", window_id, "1"], check=False)
    else:
        subprocess.run(["xdotool", "mousemove", str(x), str(y), "click", "1"], check=False)

def scroll_down(window_id=None):
    """Scroll down."""
    if window_id:
        subprocess.run(["xdotool", "key", "--window", window_id, "Page_Down"], check=False)
    else:
        subprocess.run(["xdotool", "key", "Page_Down"], check=False)

def scroll_up(window_id=None):
    """Scroll up."""
    if window_id:
        subprocess.run(["xdotool", "key", "--window", window_id, "Page_Up"], check=False)
    else:
        subprocess.run(["xdotool", "key", "Page_Up"], check=False)

def start_recording():
    """Start ffmpeg x11grab recording."""
    display = os.environ.get("DISPLAY", ":1")
    cmd = [
        "ffmpeg",
        "-y",
        "-f", "x11grab",
        "-video_size", RESOLUTION,
        "-framerate", str(FPS),
        "-i", f"{display}+0,0",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-t", str(DURATION),
        OUTPUT_PATH,
    ]
    print(f"Starting recording: {' '.join(cmd)}")
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return proc

def run_scene_actions(window_id):
    """Run scene actions during recording."""
    # Wait for browser to be ready
    time.sleep(3)
    
    for scene in SCENES:
        action = scene["action"]
        duration = scene["duration"]
        
        print(f"[{scene['time']:3d}s] {scene['desc']} ({duration}s)")
        
        if action == "hero":
            # Already on hero, just wait
            pass
        elif action == "mission":
            # Click on Atlas Freight mission in proposal list
            # Approximate coordinates for 1920x1080
            click_at(200, 600, window_id)
            time.sleep(0.5)
        elif action == "evaluate":
            # Click "Run mission" or "Evaluate with Agent IC" button
            click_at(1200, 500, window_id)
            time.sleep(0.5)
        elif action == "spend":
            # Click "Approve spend envelope"
            click_at(1100, 500, window_id)
            time.sleep(0.5)
            # Scroll to see Stripe result
            scroll_down(window_id)
            time.sleep(0.5)
        elif action == "blocked":
            # Click "Trigger blocked action"
            click_at(1300, 500, window_id)
            time.sleep(0.5)
        elif action == "evidence":
            # Click "Import evidence"
            click_at(1250, 500, window_id)
            time.sleep(0.5)
            # Scroll to see evidence
            scroll_down(window_id)
            time.sleep(0.5)
        elif action == "scroll_memo":
            # Scroll to show decision memo
            scroll_down(window_id)
            time.sleep(0.5)
        elif action == "playbook":
            # Scroll to playbook section
            scroll_down(window_id)
            time.sleep(0.5)
        elif action == "audit":
            # Scroll to audit section
            scroll_down(window_id)
            time.sleep(0.5)
        elif action == "scroll_top":
            # Scroll back to top
            for _ in range(10):
                scroll_up(window_id)
                time.sleep(0.2)
        elif action == "pause":
            # Just wait
            pass
        
        # Wait for scene duration
        time.sleep(duration)

def main():
    print("Agent IC Demo Recorder v2")
    print("=" * 50)
    
    # Check dependencies
    for cmd in ["ffmpeg", "xdotool"]:
        if subprocess.run(["which", cmd], capture_output=True).returncode != 0:
            print(f"ERROR: {cmd} not found. Install it first.")
            sys.exit(1)
    
    # Find browser window
    window_id = get_browser_window_id()
    if window_id:
        print(f"Found browser window: {window_id}")
    else:
        print("WARNING: No browser window found. Will use global coordinates.")
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    
    # Start recording
    print(f"\nStarting {DURATION}s recording to {OUTPUT_PATH}")
    print(f"Resolution: {RESOLUTION} @ {FPS}fps")
    print(f"Scenes: {len(SCENES)}")
    print()
    
    recorder = start_recording()
    
    try:
        # Run scene actions
        run_scene_actions(window_id)
        
        # Wait for recording to finish
        print("\nWaiting for recording to complete...")
        recorder.wait(timeout=DURATION + 10)
        
        if recorder.returncode == 0:
            print(f"\nSUCCESS: Video saved to {OUTPUT_PATH}")
            
            # Check file size
            size = os.path.getsize(OUTPUT_PATH)
            print(f"File size: {size / 1024 / 1024:.1f} MB")
            
            # Analyze scene transitions
            print("\nAnalyzing scene transitions...")
            result = subprocess.run(
                [
                    "ffmpeg", "-i", OUTPUT_PATH,
                    "-vf", "select='gt(scene,0.1)',showinfo",
                    "-f", "null", "-"
                ],
                capture_output=True, text=True, timeout=30
            )
            scene_count = result.stderr.count("pts_time")
            print(f"Detected scene transitions: {scene_count}")
            
            if scene_count < 8:
                print(f"WARNING: Only {scene_count} scenes detected. Target is 8-10.")
            else:
                print(f"GOOD: {scene_count} scene transitions detected.")
        else:
            print(f"ERROR: ffmpeg exited with code {recorder.returncode}")
            stderr = recorder.stderr.read().decode("utf-8", errors="replace") if recorder.stderr else ""
            print(stderr[:500])
            
    except KeyboardInterrupt:
        print("\nInterrupted by user.")
        recorder.send_signal(signal.SIGTERM)
    except Exception as e:
        print(f"\nERROR: {e}")
        recorder.send_signal(signal.SIGTERM)
    
    # Cleanup
    if recorder.poll() is None:
        recorder.terminate()
        time.sleep(1)
        if recorder.poll() is None:
            recorder.kill()

if __name__ == "__main__":
    main()
