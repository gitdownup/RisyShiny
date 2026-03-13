import {getTaskDifficulty} from "src/AIJudge";

const taskBank = [
    { id: 1, description: "Brushing teeth and washing face." },
    { id: 2, description: "60-minute deep-work session on the React frontend." },
    { id: 3, description: "Doing a fast-paced 5K run in 45 minutes." }
];

export async function processTaskBank() {
    console.log("--- Initializing AI Task Scoring (Mock DB) ---");
    console.log(`Target: Local Gamemaster via Cloudflare`);
    console.log(`Task Count: ${taskBank.length}\n`);
    for (const task of taskBank) {
        console.log(`> Processing Task #${task.id}: "${task.description}"`);

        try {
            const result = await getTaskDifficulty(task.description);

            if (result.glitchScore > 0) {
                console.warn(`!! GLITCH DETECTED !!`);
                console.warn(`Player Earned: 1 Hacker Token`);
                console.log(`Raw Output: ${result.erroneousAIResponse}`);
            } else {
                console.log(`Score: [${result.score}/10]`);
                console.log(`Reasoning: ${result.reasoning}`);
            }
        } catch (err) {
            console.error(`!! CONNECTION ERROR for Task #${task.id} !!`);
        }
        console.log("------------------------------------------");
    }

    console.log("\n--- [SCORING COMPLETE] ---\n");
}