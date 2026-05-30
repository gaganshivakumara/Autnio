import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../shared/dynamodb.js';
import { bedrockResponse, errorResponse, parseBody } from '../shared/response.js';

export const handler = async (event) => {
  try {
    const { title, startTime, endTime, attendees, description } = parseBody(event);
    const userId = event.sessionAttributes?.userId;

    if (!userId) return errorResponse(event, 401, 'Missing userId in session attributes');
    if (!title || !startTime || !endTime) {
      return errorResponse(event, 400, 'Missing required fields: title, startTime, endTime');
    }

    const profileResult = await ddb.send(
      new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: 'PROFILE' } }),
    );

    const prefs = profileResult.Item?.preferences ?? {};
    const calendarToken = prefs.calendarAccessToken;

    if (!calendarToken) {
      return errorResponse(
        event,
        403,
        'No calendar access token found. Connect your Google or Outlook calendar in Autnio settings.',
      );
    }

    const calendarEvent = {
      summary: title,
      description: description ?? '',
      start: { dateTime: startTime, timeZone: prefs.timezone ?? 'UTC' },
      end: { dateTime: endTime, timeZone: prefs.timezone ?? 'UTC' },
      attendees: attendees
        ? attendees.split(',').map((email) => ({ email: email.trim() }))
        : [],
    };

    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${calendarToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(calendarEvent),
    });

    if (!res.ok) {
      const errText = await res.text();
      return errorResponse(event, res.status, `Calendar API error: ${errText}`);
    }

    const created = await res.json();
    return bedrockResponse(event, 200, `Meeting "${title}" scheduled`, {
      eventId: created.id,
      htmlLink: created.htmlLink,
      start: startTime,
      end: endTime,
    });
  } catch (err) {
    return errorResponse(event, 500, err.message);
  }
};
