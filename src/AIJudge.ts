import supabase from 'src/config/supabaseClient';

interface AIJudgeResult {
    score: number;
    reasoning: string;
    AIExecuted: boolean;
    erroneousAIResponse?: string;
}

export async function getTaskDifficulty(taskFinished: string): Promise<AIJudgeResult> {
    try {
        // Supabase functions will handle the request and the reponse from the model
        const { data, error } = await supabase.functions.invoke('judge-task', {
            body: { 
                action: 'judge', 
                taskFinished: taskFinished 
            }
        });
        if (error) throw error;
        return data;
    } catch (e) {
        return { score: 0, reasoning: "Server connection lost. Practice your spells as the server connection restores.", AIExecuted: false };
    }
}

export async function getRejudgedTaskDifficulty(taskFinished: string, userArgument: string): Promise<AIJudgeResult> {
    try {
        // Supabase functions will handle the request and the reponse from the model
        const { data, error } = await supabase.functions.invoke('judge-task', {
            body: { 
                action: 'rejudge', 
                taskFinished: taskFinished,
                userArgument: userArgument
            }
        });

        if (error) throw error;
        return data;
    } catch (e) {
        return { score: -1, reasoning: "The higher court ignores you. Accept what you have been given.", AIExecuted: false };
    }
}
