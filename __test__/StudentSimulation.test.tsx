import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import CalendarScreen from 'src/CalendarScreen';
import * as AIJudge from 'src/AIJudge';
import { notificationService } from 'src/notifications/NotificationService';

// 1. Mock the Notification Service
jest.mock('src/notifications/NotificationService', () => ({
    notificationService: {
        initialize: jest.fn().mockResolvedValue(undefined),
        scheduleNotify: jest.fn().mockResolvedValue('mock-notification-id'),
        getExpoPushToken: jest.fn().mockReturnValue('mock-token'),
        onNotificationTapped: jest.fn().mockReturnValue(() => {}),
    }
}));

// 2. Mock the AI Judge
jest.mock('src/AIJudge', () => ({
    getTaskDifficulty: jest.fn(),
    getRejudgedTaskDifficulty: jest.fn(),
}));

// 3. Mock Supabase
jest.mock('src/config/supabaseClient', () => {
    const mockSupabase = {
        auth: {
            getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'student_123' } } }),
        },
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { global_score: 10 }, error: null, status: 200 }),
        rpc: jest.fn().mockResolvedValue({ error: null }),
    };
    mockSupabase.lt.mockResolvedValueOnce({ data: [], error: null });
    return mockSupabase;
});

describe('Student Daily Routine & Local Notification Simulation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('Simulates a student scheduling classes, receiving local notifications, and arguing with the AI', async () => {
        // Setup AI Mock responses
        (AIJudge.getTaskDifficulty as jest.Mock)
            .mockResolvedValueOnce({ score: 2, reasoning: "Basic morning hygiene and prep.", AIExecuted: true }) // 7 AM
            .mockResolvedValueOnce({ score: 4, reasoning: "Requires focus to ensure all academic materials are gathered.", AIExecuted: true }); // 8 AM

        const { getByText, getAllByText, findByText, getByDisplayValue } = render(<CalendarScreen />);

        // Wait for CalendarScreen to mount and fetch initial global points (10)
        await waitFor(() => expect(getByText('10')).toBeTruthy());

        // --- Step 1: 7:00 AM - Wake up & EEL3701C Prep ---
        fireEvent.press(getAllByText('+ Click to schedule routine')[7]);
        const input7AM = getByDisplayValue('');
        const task7AM = 'Wake up, make bed, and review EEL3701C lab materials';
        fireEvent.changeText(input7AM, task7AM);

        fireEvent(input7AM, 'blur');

        await waitFor(() => {
            // Check that the AI was called
            expect(AIJudge.getTaskDifficulty).toHaveBeenCalledWith(task7AM);

            // Check that both the start and end notifications were scheduled
            expect(notificationService.scheduleNotify).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: expect.stringContaining('Start task for hour:'),
                    body: `Your task, ${task7AM}, starts now!`
                })
            );
            expect(notificationService.scheduleNotify).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: expect.stringContaining('Claim task points for hour:'),
                    body: `Your task, ${task7AM}, is complete. Come claim your points!`
                })
            );
        });

        // --- Step 2: 8:00 AM - Packing for COP3530 ---
        fireEvent.press(getAllByText('+ Click to schedule routine')[8]);
        const input8AM = getByDisplayValue('');
        const task8AM = 'Pack laptop and notes for COP3530 and CEN3031';
        fireEvent.changeText(input8AM, task8AM);

        // Correct syntax to trigger onBlur
        fireEvent(input8AM, 'blur');

        await waitFor(() => {
            expect(AIJudge.getTaskDifficulty).toHaveBeenCalledWith(task8AM);
        });

        // --- Step 3: Checking the AI Score & Debating the 8 AM task ---
        // Student taps the triangle to see the score
        const scoreElement = await findByText('◁ 4');
        fireEvent.press(scoreElement);

        // Mock the High Court's response
        (AIJudge.getRejudgedTaskDifficulty as jest.Mock).mockResolvedValueOnce({
            score: 5,
            reasoning: "The High Court recognizes the heavy mental friction of gathering materials for two distinct courses. Score increased.",
            AIExecuted: true
        });

        // Student taps the reasoning text to open the debate modal
        fireEvent.press(getByText("Requires focus to ensure all academic materials are gathered."));

        // Student writes their argument
        const debateInput = await screen.findByPlaceholderText(/Example:/i);
        fireEvent.changeText(debateInput, 'Finding all my notes for Data Structures and Software Engineering takes extreme focus before leaving.');
        fireEvent.press(getByText('Submit Appeal'));

        await waitFor(() => {
            expect(AIJudge.getRejudgedTaskDifficulty).toHaveBeenCalled();
            // Verify the UI updated with the new debated score
            expect(getByText('◁ 5')).toBeTruthy();
        });

        // --- Step 4: Completing the Task and Claiming Points ---
        // The student gets their 9:00 AM notification to claim points, opens the app, and clicks Done
        const doneButton = getByText(/when done/i);
        fireEvent.press(doneButton);

        // Validate the score logic updated the global points correctly
        await waitFor(() => {
            // 10 initial points + 5 points from the successfully debated 8 AM task
            expect(getByText('15')).toBeTruthy();
        });
    });
});