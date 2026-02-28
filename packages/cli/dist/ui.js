import * as readline from "readline";
import { describeProject, helpText } from "./commands.js";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const GRAY = "\x1b[90m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
function color(str, c) {
    return `${c}${str}${RESET}`;
}
function printBanner(project) {
    console.log(`\n${color("ios-code", BOLD + CYAN)} ${color("— iOS-focused Claude Code assistant", GRAY)}`);
    console.log(color("─".repeat(50), GRAY));
    console.log(color(describeProject(project), GRAY));
    console.log(color("Type /help for commands, or start chatting. Ctrl+C to exit.\n", GRAY));
}
/**
 * Start the interactive readline REPL.
 */
export function startUI(project, onUserMessage, onSlashCommand) {
    printBanner(project);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: color("\n> ", GREEN),
        terminal: true,
    });
    rl.prompt();
    rl.on("line", async (line) => {
        const input = line.trim();
        if (!input) {
            rl.prompt();
            return;
        }
        console.log(color(`\nYou: ${input}`, BLUE));
        // Check for slash command
        const { parseSlashCommand } = await import("./commands.js");
        const command = parseSlashCommand(input);
        if (command) {
            if (command.type === "help") {
                console.log(color("\n" + helpText(), GRAY));
                rl.prompt();
                return;
            }
            if (command.type === "unknown") {
                console.log(color(`✖ Unknown command: ${command.input}. Type /help for available commands.`, RED));
                rl.prompt();
                return;
            }
            console.log(color(`\nRunning ${input}...\n`, GRAY));
            try {
                await onSlashCommand(command);
            }
            catch (err) {
                console.error(color(`✖ ${err instanceof Error ? err.message : String(err)}`, RED));
            }
        }
        else {
            process.stdout.write(color("\nios-code: ", CYAN + BOLD));
            try {
                await onUserMessage(input);
            }
            catch (err) {
                console.error(color(`\n✖ ${err instanceof Error ? err.message : String(err)}`, RED));
            }
            process.stdout.write("\n");
        }
        rl.prompt();
    });
    rl.on("close", () => {
        console.log(color("\nGoodbye!", GRAY));
        process.exit(0);
    });
}
//# sourceMappingURL=ui.js.map