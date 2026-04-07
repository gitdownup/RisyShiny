import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Modal, ActivityIndicator, Alert } from 'react-native';
import supabase from 'src/config/supabaseClient';
import { getTaskDifficulty, getRejudgedTaskDifficulty } from 'src/AIJudge';
import { notificationService } from 'src/notifications/NotificationService';

interface AIDataState {
    score?: number;
    reasoning?: string;
    has_menu_open?: boolean;
    is_reported?: boolean;
}

export default function CalendarScreen() {
    const hoursOfDay = Array.from({ length: 24 }, (_, i) => i);

    const [editingHour, setEditingHour] = React.useState<number | null>(null); // Track which hour rectangle is being typed into
    const [routines, setRoutines] = React.useState<Record<number, string>>({}); // Store the text of each rectangle
    const [eventIds, setEventIds] = React.useState<Record<number, string>>({}); // Track event IDs for performance and SunnyStreak team convenience
    const [AIData, setAIData] = React.useState<Record<number, AIDataState>>({}); // Stores the scores and reasoning for each hour, keyed by the 24-hour index
    const [debateHour, setDebateHour] = React.useState<number | null>(null); // Stores the specific hour currently being appealed; null means the modal is closed
    const [debateText, setDebateText] = React.useState(''); // Holds the user's written argument for the High Court while they are typing in the modal
    const [isDebating, setIsDebating] = React.useState(false); // Tracks the loading state of the thinking model API call to show a spinner and disable buttons
    const [debatedHours, setDebatedHours] = React.useState<number[]>([]); // Tracks which hours have already been appealed to prevent infinite arguing
    const [globalPoints, setGlobalPoints] = React.useState<number>(0); // Tracks the number of points earned in total

    const loadFromDBTodaysEvents = async (user_id: string) => {
        // Get the start and end of today in ISO format (UTC)
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
        const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

        // Ask Supabase for events belonging to this user that fall within today
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .eq('user_id', user_id)
            .gte('start_time', start)
            .lt('start_time', end);

        if (error) {
            console.error("Error loading events:", error);
            return;
        }

        console.log("Events fetched:", JSON.stringify(data, null, 2));

        // If events found, put them into React states, so they display on screen
        if (data) {
            const fetchedRoutines: Record<number, string> = {};
            const fetchedIds: Record<number, string> = {};
            const fetchedAIData: Record<number, AIDataState> = {};

            data.forEach(event => {
                const hour = new Date(event.start_time).getHours();
                fetchedRoutines[hour] = event.title;
                fetchedIds[hour] = event.id; // Store the DB id, so it can be updated when a user changes the event.
                fetchedAIData[hour] = {
                    score: event.score,
                    reasoning: event.description,
                    has_menu_open: event.has_menu_open,
                    is_reported: event.is_reported
                };
            });

            setRoutines(fetchedRoutines);
            setEventIds(fetchedIds);
            setAIData(fetchedAIData);
        }
    };

    // Fetch only email and points from users table in database
    React.useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                // Fetch events using the email
                await loadFromDBTodaysEvents(user.id);

                const { data, error, status } = await supabase
                    .from('profiles')
                    .select('global_score')
                    .eq('id', user.id)
                    .single();

                if (error) {
                    console.error("fetch error:", error.message);
                    console.error("Full error object:", JSON.stringify(error, null, 2));
                    console.log("HTTP Status:", status);
                    return;
                }

                console.log("Points fetched:", JSON.stringify(data, null, 2));

                if (data && data.global_score !== undefined) {
                    setGlobalPoints(data.global_score);
                }
            }
        };
        init().catch(console.error);
    }, []);

    const handleSave = async (hour: number) => {
        setEditingHour(null);
        const text = routines[hour]?.trim();
        const existingId = eventIds[hour];

        // Clear previous AI data if the user edits the task
        setAIData(prev => {
            const next = { ...prev };
            delete next[hour];
            return next;
        });

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const start = new Date();
        start.setHours(hour, 0, 0, 0);
        const startTime = start.toISOString();

        const end = new Date();
        end.setHours(hour + 1, 0, 0, 0);
        const endTime = end.toISOString();

        try {
            if (text) {
                let currentEventId = existingId;
                if (existingId) {
                    const { error } = await supabase
                        .from('events')
                        .update({ title: text })
                        .eq('id', existingId);
                    if (error) {
                        console.error("Update failed:", error.message);
                        return; // Stop execution if the DB didn't accept the change
                    }
                    console.log("Event updated successfully.");
                } else {
                    const {data, error} = await supabase
                        .from('events')
                        .insert({
                            user_id: user.id,
                            title: text,
                            start_time: startTime,
                            end_time: endTime,
                            score: 0,
                            has_menu_open: false,
                            is_reported: false
                        })
                        .select()
                        .single();

                    if (error) {
                        console.error("Insert failed:", error.message);
                        return;
                    }
                    if (data) {
                        setEventIds(prev => ({...prev, [hour]: data.id}));
                        currentEventId = data.id; // Capture the new id for the AI to use
                    }
                }

                // Notify user later to start task
                try {
                    await notificationService.scheduleNotify({
                        title: `Start task for hour: ${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`,
                        body: `Your task, ${text}, starts now!`,
                        at: start,
                        data: { path: '/(tabs)' } // Allows tapping the notification to route back to the app
                    });
                } catch (notifyError) {
                    console.error("Failed to schedule \"start task\" notification:", notifyError);
                }

                // Notify user later to claim the task's points
                try {
                    await notificationService.scheduleNotify({
                        title: `Claim task points for hour: ${end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`,
                        body: `Your task, ${text}, is complete. Come claim your points!`,
                        at: end,
                        data: { path: '/(tabs)' } // Allows tapping the notification to route back to the app
                    });
                } catch (notifyError) {
                    console.error("Failed to schedule \"claim points\" notification:", notifyError);
                }

                // Fetch the AI data on save, and put it in Supabase
                getTaskDifficulty(text).then(async result => {
                    // Update UI
                    setAIData(prev => ({...prev, [hour]: {
                            score: result.score,
                            reasoning: result.reasoning,
                            is_reported: prev[hour]?.is_reported || false
                        }}));

                    // Update Database
                    if (currentEventId) {
                        const { error } = await supabase
                            .from('events')
                            .update({
                                score: result.score,
                                description: result.reasoning
                            })
                            .eq('id', currentEventId);

                        if (error) {
                            console.error(`Failed to save to DB score for hour ${hour}:`, error.message);
                        } else {
                            console.log(`Score ${result.score} saved to DB for hour ${hour}`);
                        }
                    }
                });
            } else if (!text && existingId) {
                // Delete event from calendar
                const { error } = await supabase
                    .from('events')
                    .delete()
                    .eq('id', existingId);
                if (error) {
                    console.error("Failed to delete event:", error.message);
                } else {
                    console.log("Event successfully cleared from database.");
                }

                setEventIds(prev => { const n = {...prev}; delete n[hour]; return n; });
            }
        } catch (e) {
            console.error("Save failed:", e);
        }
    };

    // The big rectangle under an event that appears when clicking the event's score triangle
    const toggleEventDetails = async (hour: number) => {
        const currentData = AIData[hour] || {};
        const existingId = eventIds[hour];
        const newMenuState = !currentData.has_menu_open;

        // Update calendar immediately
        if (currentData.score !== undefined) {
            setAIData(prev => ({...prev, [hour]: {
                    ...currentData, has_menu_open: newMenuState }
            }));
        }

        // Save the updated calendar event to Supabase
        if (existingId) {
            try {
                const { error } = await supabase
                    .from('events')
                    .update({ has_menu_open: newMenuState })
                    .eq('id', existingId);

                if (error) console.error("Failed to update calendar event:", error.message);
            } catch (e) {
                console.error("Supabase update error:", e);
            }
        }
    };

    // On task finish, reset the event to default state
    const handleCompleteTask = async (hour: number) => {
        const existingId = eventIds[hour];

        const pointsEarned = AIData[hour]?.score || 0;
        console.log(`Current global: ${globalPoints} | Earned from event: ${pointsEarned}`);

        const newTotalPoints = globalPoints + pointsEarned;
        console.log(`New total points: ${newTotalPoints}`);

        // Update UI immediately
        setGlobalPoints(newTotalPoints);
        setRoutines(prev => { const n = {...prev}; delete n[hour]; return n; });
        setAIData(prev => { const n = {...prev}; delete n[hour]; return n; });
        setEventIds(prev => { const n = {...prev}; delete n[hour]; return n; });

        if (existingId) {
            try {
                // Call the DB function to handle the global points math
                // TODO: handle cheating if a user just calls DB to create an event with a very large point value
                const { error: error } = await supabase.rpc('score_task', {
                    target_event_id: existingId
                });

                if (error) {
                    console.error("Failed to score task via DB:", error.message);
                } else {
                    console.log("Successfully saved points via database function.");
                }

                // Delete the event from the calendar
                const { error: errorDelete } = await supabase
                    .from('events')
                    .delete()
                    .eq('id', existingId);

                if (errorDelete) {
                    console.error("Failed to delete event:", errorDelete.message);
                } else {
                    console.log("Event successfully cleared from database.");
                }

            } catch (e) {
                console.error("Failed to clear completed task or update points:", e);
            }
        }
    };

    const handleReportTask = async (hour: number) => {
        const existingId = eventIds[hour];
        if (!existingId) return;

        Alert.alert(
            "Report Task",
            `Are you sure you want to report the task at ${hour % 12 === 0 ? 12 : hour % 12}:00 ${hour >= 12 ? 'PM' : 'AM'}?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Report",
                    style: "destructive",
                    onPress: async () => {
                        // Change the UI immediately
                        setAIData(prev => ({
                            ...prev,
                            [hour]: { ...prev[hour], is_reported: true }
                        }));

                        // Update Supabase
                        const { error } = await supabase
                            .from('events')
                            .update({ is_reported: true })
                            .eq('id', existingId);

                        // If Supabase connection fails, undo the UI change
                        if (error) {
                            console.error("Failed to report task to database:", error.message);
                            setAIData(prev => ({
                                ...prev,
                                [hour]: { ...prev[hour], is_reported: false }
                            }));
                            Alert.alert("Error", "Failed to report task. Please try again.");
                        } else {
                            console.log(`Task at hour ${hour} successfully reported.`);
                        }
                    }
                }
            ]
        );
    };

    const handleSubmitDebate = async () => {
        if (debateHour === null || !debateText.trim()) return;

        setIsDebating(true);
        const hourToDebate = debateHour;
        const taskText = routines[hourToDebate];
        const eventId = eventIds[hourToDebate];

        // Call thinking model
        const result = await getRejudgedTaskDifficulty(taskText, debateText);

        // Update the UI with the new score and the thinking model's response
        setAIData(prev => ({...prev, [hourToDebate]: {...prev[hourToDebate],
            score: result.score === -1 ? prev[hourToDebate].score : result.score,
            reasoning: result.reasoning
        }}));

        // Save the debate result to the database
        if (eventId) {
            const { error } = await supabase
                .from('events')
                .update({
                    score: result.score === -1 ? AIData[hourToDebate].score : result.score,
                    description: result.reasoning
                })
                .eq('id', eventId);
            if (error) {
                console.error("Error saving debate results:", error);
                return;
            }
        }

        // Stop the user from arguing with the event's AI response again
        setDebatedHours(prev => [...prev, hourToDebate]);

        // Close and reset the modal
        setIsDebating(false);
        setDebateHour(null);
        setDebateText('');
    };

    return (
        <View style={styles.mainContainer}>
            {/* Header Section */}
            <View style={styles.headerContainer}>
                {/* Inventory Hotbar */}
                <View style={styles.inventoryContainer}>
                    <Text style={styles.inventoryLabel}>Items</Text>
                    <View style={styles.hotbar}>
                        {[...Array(6)].map((_, index) => (
                            <TouchableOpacity
                                key={index}
                                style={styles.inventorySlot}
                                onPress={() => console.log(`Slot ${index} pressed`)}
                            >
                                {/* Future item icons will go here */}
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
                {/* Global Points Display */}
                <View style={styles.pointsContainer}>
                    <Text style={styles.pointsLabel}>Global Points</Text>
                    <Text style={styles.pointsValue}>{globalPoints}</Text>
                </View>
            </View>
            {/* Scrollable hour bars Section */}
            <ScrollView style={styles.calendarDayView}>
                {hoursOfDay.map((hour) => {
                    const isEditing = editingHour === hour;
                    const timeLabel = `${hour % 12 === 0 ? 12 : hour % 12}:00 ${hour >= 12 ? 'PM' : 'AM'}`;

                    const hasRoutine = !!routines[hour];
                    const currentAIData = AIData[hour] || {}
                    const isReported = currentAIData.is_reported;

                    return (
                        <View key={hour}>
                            <View style={styles.timeSlot}>
                            <Text style={styles.timeLabel}>{timeLabel}</Text>

                            <TouchableOpacity
                                style={styles.eventArea}
                                activeOpacity={1}
                                onPress={() => setEditingHour(hour)}
                            >
                                {isEditing ? (
                                    <TextInput
                                        autoFocus
                                        value={routines[hour] || ''}
                                        onChangeText={(t) => setRoutines({ ...routines, [hour]: t })}

                                        // Clicking away triggers: save + AI
                                        onBlur={() => handleSave(hour)}

                                        // Tell the keyboard to vanish when 'enter' is pressed
                                        submitBehavior="blurAndSubmit"

                                        style={styles.textInput}
                                    />
                                ) : (
                                    <Text style={{ color: routines[hour] ? '#333' : '#007bff' }}>
                                        {routines[hour] || '+ Click to schedule routine'}
                                    </Text>
                                )}
                            </TouchableOpacity>

                            {/* Triangle Button */}
                            {hasRoutine && !isEditing && (
                                <TouchableOpacity
                                    style={styles.triangleButton}
                                    onPress={() => toggleEventDetails(hour)}
                                    // Make the button visually inactive if there's no score yet
                                    activeOpacity={currentAIData.score !== undefined ? 0.2 : 1}
                                >
                                    {currentAIData.score !== undefined ? (
                                        <Text style={styles.triangleScoreText}>◁ {currentAIData.score}</Text>
                                    ) : (
                                        <View style={styles.triangleIcon} />
                                    )}
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Row Expansion rectangle (event's menu) */}
                        {currentAIData.has_menu_open && (
                            <View style={styles.expandedRow}>

                                {/* Done button */}
                                <TouchableOpacity
                                    style={styles.doneButton}
                                    onPress={() => handleCompleteTask(hour)}
                                >
                                    <Text style={styles.doneText}>Press{'\n'}when done{'\n'}with task</Text>
                                </TouchableOpacity>

                                {/* Report Button */}
                                <TouchableOpacity
                                    style={[styles.reportButton, isReported && styles.reportedButton]}
                                    onPress={() => handleReportTask(hour)}
                                    disabled={isReported}
                                >
                                    <Text style={[styles.reportText, isReported && styles.reportedText]}>
                                        {isReported ? 'Reported' : 'Report'}
                                    </Text>
                                </TouchableOpacity>

                                {/* Reasoning Area */}
                                <TouchableOpacity
                                    style={styles.reasoningArea}
                                    activeOpacity={0.8}
                                    onPress={() => {
                                        if (debatedHours.includes(hour)) {
                                            alert("Sorry, but the case is closed.");
                                        } else {
                                            setDebateHour(hour);
                                        }
                                    }}
                                >
                                    <Text style={styles.reasoningText}>
                                        {currentAIData.reasoning}
                                    </Text>

                                    <Text style={styles.debateHintText}>
                                        {debatedHours.includes(hour)
                                            ? "case closed by High Court"
                                            : "tap to debate this score"}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        </View>
                    );
                })}
            </ScrollView>
            {/* The Debate Modal */}
            <Modal
                visible={debateHour !== null}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setDebateHour(null)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Appeal to the higher court</Text>
                        <Text style={styles.modalSubtitle}>Explain why you disagree in one sentence:</Text>

                        <TextInput
                            style={styles.modalInput}
                            multiline
                            placeholder="Example: My friend's wheeled-throne was squeaking at a frequency that caused my window to break, prohibiting any bird-watching."
                            value={debateText}
                            onChangeText={setDebateText}
                            maxLength={100} // Keep it brief
                        />

                        <View style={styles.modalButtonRow}>
                            <TouchableOpacity
                                style={[styles.modalButton, { backgroundColor: '#ccc' }]}
                                onPress={() => { setDebateHour(null); setDebateText(''); }}
                                disabled={isDebating}
                            >
                                <Text>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.modalButton, { backgroundColor: '#4a86e8' }]}
                                onPress={handleSubmitDebate}
                                disabled={isDebating || !debateText.trim()}
                            >
                                {isDebating ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff' }}>Submit Appeal</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    mainContainer: {
        flex: 1,
        backgroundColor: '#fff'
    },
    headerContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingVertical: 12,
        backgroundColor: '#f1f5f9',
        borderBottomWidth: 1,
        borderBottomColor: '#ddd',
        elevation: 2, // shadow for Android
        shadowColor: '#000', // shadow for iOS
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    inventoryContainer: {
        flexDirection: 'column',
    },
    inventoryLabel: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#64748b',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    hotbar: {
        flexDirection: 'row',
        gap: 6,
    },
    inventorySlot: {
        width: 32,
        height: 32,
        backgroundColor: '#e2e8f0',
        borderWidth: 2,
        borderColor: '#94a3b8',
        borderRadius: 4, // Round edges
        justifyContent: 'center',
        alignItems: 'center',
    },
    pointsContainer: {
        alignItems: 'flex-end',
    },
    pointsLabel: {
        fontSize: 12,
        color: '#64748b',
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    pointsValue: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fbbf24',
    },
    calendarDayView: { flex: 1 },
    timeSlot: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    timeLabel: { width: 100, fontWeight: 'bold' },
    eventArea: { flex: 1, minHeight: 30, justifyContent: 'center' },
    textInput: {
        width: '100%',
        padding: 5,
        backgroundColor: '#f9f9f9',
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 4,
    },
    triangleButton: {
        paddingHorizontal: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    triangleIcon: {
        width: 0,
        height: 0,
        backgroundColor: 'transparent',
        borderStyle: 'solid',
        borderLeftWidth: 10,
        borderRightWidth: 10,
        borderTopWidth: 15,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: '#bde0fe',
    },
    triangleScoreText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
    },
    expandedRow: { // AKA event's menu
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#333',
        minHeight: 60,
    },
    doneButton: {
        backgroundColor: '#8fbc8f',
        width: 100,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 5,
        borderRightWidth: 1,
        borderRightColor: '#333',
    },
    doneText: {
        textAlign: 'center',
        color: '#000',
        fontSize: 12,
    },
    reportButton: {
        backgroundColor: '#fca5a5',
        width: 70,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 5,
        borderRightWidth: 1,
        borderRightColor: '#333',
    },
    reportedButton: {
        backgroundColor: '#e5e7eb',
    },
    reportText: {
        textAlign: 'center',
        color: '#000',
        fontSize: 12,
        fontWeight: 'bold'
    },
    reportedText: {
        color: '#6b7280',
        fontStyle: 'italic'
    },
    reasoningArea: {
        flex: 1,
        backgroundColor: '#4a86e8',
        padding: 10,
        justifyContent: 'center',
    },
    reasoningText: {
        color: '#000',
        fontSize: 14,
    },
    debateHintText: {
        color: '#000',
        fontSize: 10,
        fontStyle: 'italic',
        marginTop: 4,
        opacity: 0.6,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        width: '100%',
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 20,
        elevation: 5,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 5,
    },
    modalSubtitle: {
        fontSize: 14,
        color: '#666',
        marginBottom: 15,
    },
    modalInput: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 4,
        padding: 10,
        minHeight: 80,
        textAlignVertical: 'top',
        marginBottom: 20,
    },
    modalButtonRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
    },
    modalButton: {
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 4,
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: 80,
    }
});