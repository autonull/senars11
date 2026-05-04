
import { MeTTaInterpreter } from '@senars/metta/src/MeTTaInterpreter.js';

async function runDemo() {
    console.log('🔮 MeTTa Reflection Playground 🔮\n');

    const interpreter = new MeTTaInterpreter();

    // 1. System Interaction
    console.log('--- System Interaction (OS/Path) ---');
    const systemScript = `
        ;; Import Node.js modules
        (= (os) (&js-import "os"))
        (= (path) (&js-import "path"))

        ;; Get system info
        (= (get-platform)
            (&js-call (os) "platform")
        )

        ;; Join paths
        (= (join-paths $a $b)
            (&js-call (path) "join" $a $b)
        )

        !(get-platform)
        !(join-paths "/home/user" "projects")
    `;

    const sysRes = await interpreter.runAsync(systemScript);
    console.log('Platform:', sysRes[0].toString());
    console.log('Joined Path:', sysRes[1].toString());
    console.log();

    // 2. Custom Object Manipulation
    console.log('--- Custom Object Manipulation ---');

    class Robot {
        constructor(name) {
            this.name = name;
            this.battery = 100;
        }

        move(distance) {
            this.battery -= distance * 0.1;
            return `${this.name} moved ${distance}m. Battery: ${this.battery}%`;
        }

        charge() {
            this.battery = 100;
            return "Recharged!";
        }
    }

    // Register class globally so MeTTa can find it via &js-global
    global.Robot = Robot;

    const robotScript = `
        ;; Get the Robot class
        (= (RobotClass) (&js-global "Robot"))

        ;; Create instance
        (= (my-bot) (&js-new (RobotClass) "R2-D2"))

        ;; Inspect property
        !(chain-log "Initial Name:" (&js-get (my-bot) "name"))

        ;; Call method
        !(chain-log "Action:" (&js-call (my-bot) "move" 50))

        ;; Check property change
        !(chain-log "Battery Level:" (&js-get (my-bot) "battery"))

        ;; Modify property directly
        !(&js-set (my-bot) "name" "C-3PO")
        !(chain-log "New Name:" (&js-get (my-bot) "name"))
    `;

    // Add helper to log from inside MeTTa
    interpreter.ground.register('chain-log', (prefix, val) => {
        console.log(prefix.toString(), val.toString());
        return val;
    });

    await interpreter.runAsync(robotScript);
    console.log();

    // 3. Dynamic Logic Generation
    console.log('--- Dynamic Logic Generation ---');
    // We can use JS to build MeTTa expressions dynamically based on runtime data

    const dynamicData = {
        targets: ['alpha', 'beta', 'gamma'],
        threshold: 0.75
    };

    const logicScript = `
        (= (process-target $t)
            (if (== $t "beta")
                "skipped"
                (format "processed " $t)
            )
        )

        ;; Mock equality since we are in minimal mode
        (= (== $a $b)
            (unify $a $b True False)
        )

        ;; Mock format
        (= (format $a $b)
            (&js-call (&js-new (&js-global "String") $a) "concat" $b)
        )
    `;

    await interpreter.runAsync(logicScript);

    for (const target of dynamicData.targets) {
        const expr = `!(process-target "${target}")`;
        const res = await interpreter.runAsync(expr);
        console.log(`Target ${target} ->`, res[0].toString());
    }
}

runDemo().catch(console.error);
