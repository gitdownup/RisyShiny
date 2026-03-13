import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';

export default function CalendarScreen() {
    const hoursOfDay = Array.from({ length: 24 }, (_, i) => i);

    // Track which hour rectangle is being typed into
    const [editingHour, setEditingHour] = React.useState<number | null>(null);

    // Store the text of each rectangle
    const [routines, setRoutines] = React.useState<Record<number, string>>({});

    const handleInputChange = (hour: number, value: string) => {
        setRoutines({ ...routines, [hour]: value });
    };

    return (
        <ScrollView style={styles.calendarDayView}>
            {hoursOfDay.map((hour) => {
                const isEditing = editingHour === hour;
                const timeLabel = `${hour % 12 === 0 ? 12 : hour % 12}:00 ${hour >= 12 ? 'PM' : 'AM'}`;

                return (
                    <View style={styles.timeSlot} key={hour}>
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
                                    onChangeText={(text) => handleInputChange(hour, text)}
                                    onBlur={() => setEditingHour(null)}
                                    style={styles.textInput}
                                />
                            ) : (
                                <Text style={{ color: routines[hour] ? '#333' : '#007bff' }}>
                                    {routines[hour] || '+ Click to schedule routine'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                );
            })}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    calendarDayView: {
        flex: 1,
    },
    timeSlot: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    timeLabel: {
        width: 100,
        fontWeight: 'bold',
    },
    eventArea: {
        flex: 1,
        minHeight: 30,
        justifyContent: 'center',
    },
    textInput: {
        width: '100%',
        padding: 5,
        backgroundColor: '#f9f9f9',
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 4,
    }
});