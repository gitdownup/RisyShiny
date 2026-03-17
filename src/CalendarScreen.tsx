import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import supabase from 'src/config/supabaseClient';
import { getTaskDifficulty, getRejudgedTaskDifficulty } from 'src/AIJudge';

interface AIDataState {
    score?: number;
    reasoning?: string;
    expanded?: boolean;
}

export default function CalendarScreen() {
    const hoursOfDay = Array.from({ length: 24 }, (_, i) => i);

    const [editingHour, setEditingHour] = React.useState<number | null>(null); // Track which hour rectangle is being typed into
    const [routines, setRoutines] = React.useState<Record<number, string>>({}); // Store the text of each rectangle
    const [eventIds, setEventIds] = React.useState<Record<number, string>>({}); // Track event IDs for performance and SunnyStreak team convenience
    const [aiData, setAiData] = React.useState<Record<number, AIDataState>>({}); // Stores the scores and reasoning for each hour, keyed by the 24-hour index
    const [debateHour, setDebateHour] = React.useState<number | null>(null); // Stores the specific hour currently being appealed; null means the modal is closed
    const [debateText, setDebateText] = React.useState(''); // Holds the user's written argument for the High Court while they are typing in the modal
    const [isDebating, setIsDebating] = React.useState(false); // Tracks the loading state of the Thinking model API call to show a spinner and disable buttons
    const [debatedHours, setDebatedHours] = React.useState<number[]>([]); // Tracks which hours have already been appealed to prevent infinite arguing
    const [globalPoints, setGlobalPoints] = React.useState<number>(0); // Tracks the number of points earned in total

    const loadFromDBTodaysEvents = async (uid: string) => {
        // Get the start and end of today in ISO format (UTC)
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
        const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

        // Ask Supabase for events belonging to this user that fall within today
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .eq('user_id', uid)
            .gte('start_time', start)
            .lt('start_time', end);

        if (error) {
            console.error("Error loading events:", error);
            return;
        }

        // If events found, put them into React states, so they display on screen
        if (data) {
            const fetchedRoutines: Record<number, string> = {};
            const fetchedIds: Record<number, string> = {};

            data.forEach(event => {
                const hour = new Date(event.start_time).getHours();
                fetchedRoutines[hour] = event.title;
                fetchedIds[hour] = event.ID; // Store the DB ID, so it can be updated when a user changes the event.
            });

            setRoutines(fetchedRoutines);
            setEventIds(fetchedIds);
        }
    };

    // Get user ID from database
    React.useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) await loadFromDBTodaysEvents(user.id);
        };
        init().catch(console.error);
    }, []);

    const handleSave = async (hour: number) => {
        setEditingHour(null);
        const text = routines[hour]?.trim();
        const existingId = eventIds[hour];

        // Clear previous AI data if the user edits the task
        setAiData(prev => {
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
                if (existingId) {
                    await supabase
                        .from('events')
                        .update({title: text})
                        .eq('ID', existingId);
                } else {
                    const {data, error} = await supabase
                        .from('events')
                        .insert({
                            user_id: user.id,
                            title: text,
                            start_time: startTime,
                            end_time: endTime,
                            score: 0
                        })
                        .select()
                        .single();

                    if (error) {
                        console.error("Insert failed:", error.message);
                        return;
                    }
                    if (data) setEventIds(prev => ({...prev, [hour]: data.ID}));
                }
                // Fetch the AI data on save
                getTaskDifficulty(text).then(result => {
                    setAiData(prev => ({...prev, [hour]: {
                        score: result.score,
                        reasoning: result.reasoning,
                        expanded: false
                    }}));
                });
            } else if (!text && existingId) { // Delete event if text is completely cleared
                await supabase.from('events').delete().eq('ID', existingId);
                setEventIds(prev => { const n = {...prev}; delete n[hour]; return n; });
            }
        } catch (e) {
            console.error("Save failed:", e);
        }
    };

    // The big rectangle under an event that appears when clicking the event's score triangle
    const toggleEventDetails = (hour: number) => {
        const currentData = aiData[hour] || {};

        if (currentData.score !== undefined) {
            setAiData(prev => ({...prev, [hour]: {
                ...currentData, expanded: !currentData.expanded }
            }));
        }
    };

    // On task finish, reset the event to default state
    const handleCompleteTask = async (hour: number) => {
        const existingId = eventIds[hour];

        // Add event score to global score
        const pointsEarned = aiData[hour]?.score || 0;
        setGlobalPoints(prev => prev + pointsEarned);

        // Wipe local states to immediately return to the "Click to schedule" look
        setRoutines(prev => { const n = {...prev}; delete n[hour]; return n; });
        setAiData(prev => { const n = {...prev}; delete n[hour]; return n; });
        setEventIds(prev => { const n = {...prev}; delete n[hour]; return n; });

        // Delete from database so it doesn't pop back up on-screen refresh
        if (existingId) {
            try {
                await supabase.from('events').delete().eq('ID', existingId);
                // TODO: Update user's global points in the database here
            } catch (e) {
                console.error("Failed to clear completed task:", e);
            }
        }
    };

    const handleSubmitDebate = async () => {
        if (debateHour === null || !debateText.trim()) return;

        setIsDebating(true);
        const hourToDebate = debateHour;
        const taskText = routines[hourToDebate];

        // Call thinking model
        const result = await getRejudgedTaskDifficulty(taskText, debateText);

        // Update the UI with the new score and the thinking model's response
        setAiData(prev => ({...prev, [hourToDebate]: {...prev[hourToDebate],
            score: result.score === -1 ? prev[hourToDebate].score : result.score,
            reasoning: result.reasoning
        }}));

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
                    const currentAiData = aiData[hour] || {};

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

                                        // Hitting 'enter' triggers: save + AI
                                        onSubmitEditing={() => handleSave(hour)}

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
                                    activeOpacity={currentAiData.score !== undefined ? 0.2 : 1}
                                >
                                    {currentAiData.score !== undefined ? (
                                        <Text style={styles.triangleScoreText}>◁ {currentAiData.score}</Text>
                                    ) : (
                                        <View style={styles.triangleIcon} />
                                    )}
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Row Expansion rectangle */}
                        {currentAiData.expanded && (
                            <View style={styles.expandedRow}>
                                <TouchableOpacity
                                    style={styles.doneButton}
                                    onPress={() => handleCompleteTask(hour)}
                                >
                                    <Text style={styles.doneText}>Press{'\n'}when done{'\n'}with task</Text>
                                </TouchableOpacity>

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
                                        {currentAiData.reasoning}
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
    expandedRow: {
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