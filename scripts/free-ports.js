import { execSync } from 'child_process';

const PORTS = [4000, 4005, 5173];

function freePort(port) {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano -p tcp`, { encoding: 'utf8' });
      const lines = output.split('\n');
      const pids = new Set();

      for (const line of lines) {
        if (line.includes(`:${port}`) && line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0' && pid !== `${process.pid}`) {
            pids.add(pid);
          }
        }
      }

      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          console.log(`[free-ports] Freed port ${port} by terminating PID ${pid}`);
        } catch {
          // Process may have already exited
        }
      }
    } else {
      try {
        execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'ignore' });
        console.log(`[free-ports] Freed port ${port}`);
      } catch {
        // No process on port
      }
    }
  } catch (err) {
    // Port already free or netstat had no matches
  }
}

for (const port of PORTS) {
  freePort(port);
}
