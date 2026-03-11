// Paste your generated Cloudflare URL here (No trailing slash!)
const OLLAMA_TUNNEL_URL = "https://www.risyshiny.com";

// TODO start: This is temporary. Events should be received from PostGreSQL database
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

            if (result.status === "glitch_detected") {
                console.warn(`!! GLITCH DETECTED !!`);
                console.warn(`Player Earned: 1 Hacker Token`);
                console.log(`Raw Output: ${result.rawOutput}`);
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
// TODO end

/**
 * Sends a task to an AI judge and returns the score, reasoning, and if the AI executed.
 * @param {string} taskFinished - The event the user finished.
 * @returns {Promise<{score: number, reasoning: string, glitchScore: number, AIexecuted: bool}>}
 */
export async function getTaskDifficulty(taskFinished) {
    try {
        console.log(`Sending task to Gamemaster: "${taskFinished}"`);

        const response = await fetch(`${OLLAMA_TUNNEL_URL}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "gamemaster",
                prompt: taskFinished,
                stream: false // We want the full answer at once, not word-by-word
            })
        });

        if (!response.ok) {
            throw new Error(`AI Server Error: ${response.status}`);
        }

        const data = await response.json();
        const aiResponseText = data.response; // e.g., "Score: 6\nReasoning: High Effort..."

        // Using regex to extract the number after "Score:" and the text after "Reasoning:" within the AI response
        const scoreMatch = aiResponseText.match(/Score:\s*(\d+)/i);
        const reasoningMatch = aiResponseText.match(/Reasoning:\s*(.+)/i);

        if (scoreMatch && reasoningMatch) {
            return {
                score: parseInt(scoreMatch[1], 10),
                reasoning: reasoningMatch[1].trim(),
                glitchScore: 0,
                AIExecuted: true
            };
        } else { // AI outputted improper format
            return {
                score: 0,
                reasoning: "The judge could not make a decision. A beam from the sky brightens you.",
                glitchScore: 3,
                AIExecuted: true
            };
        }

    } catch (error) {
        console.error("Critical Gamemaster Failure:", error);
        return {
            score: 0,
            reasoning: "Server connection lost. Practice your spells as the server connection restores.",
            glitchScore: 0,
            AIExecuted: false
        };
    }
}

// Quick Test Execution (You can delete this later)
// getTaskDifficulty("A 50-minute heavy leg day workout at the gym").then(console.log);