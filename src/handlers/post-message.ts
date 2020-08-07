import dynamodb from 'aws-sdk/clients/dynamodb';
import Sns from 'aws-sdk/clients/sns';
import * as uuid from 'uuid';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { Message, NewMessageRequestBody } from './model';

function isNewMessageRequestBody(parsedBody: NewMessageRequestBody): parsedBody is NewMessageRequestBody {
    if (parsedBody.title && parsedBody.description && parsedBody.username) {
        return true;
    }

    return false;
}

function validateInput(parsedBody: {[key: string]: string }): string | undefined {
    if (!parsedBody.username) {
        return 'username';
    }

    if (!parsedBody.title) {
        return 'title';
    }

    if (!parsedBody.description) {
        return 'description';
    }

    return undefined;
}

function createMessage({ title, description, username }: NewMessageRequestBody): Message {
    const newUuid = uuid.v4();
    const createdAt = Date.now();

    const message: Message = {
        uuid: newUuid,
        title,
        description,
        username,
        createdAt
    };

    return message;
}

async function insertMessageToDB(message: Message) {
    const docClient = new dynamodb.DocumentClient();
    const tableName = process.env.DYNAMODB_MESSAGES_TABLE || 'MessagesTable';

    const dynamoParams = {
        TableName: tableName,
        Item: message
    };

    await docClient.put(dynamoParams).promise();
}

async function publishMessageToTopic(message: Message) {
    const topicArn = process.env.SNS_MESSAGE_TOPIC_ARN;

    const snsParams = {
        Message: JSON.stringify(message),
        TopicArn: topicArn || 'SNS_MESSAGES'
    };

    const snsClient = new Sns();
    await snsClient.publish(snsParams).promise();
}

export async function postMessageHandler(event: APIGatewayProxyEvent) {
    const { body, httpMethod, path } = event;

    if (httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ success: false, message: `postMessage only accepts POST method, you tried: ${httpMethod} method.` })
        };
    }

    if (!body) {
        return {
            statusCode: 422,
            body: JSON.stringify({ success: false, message: 'Invalid request body.' })
        };
    }

    const parsedBody = JSON.parse(body);

    if (!isNewMessageRequestBody(parsedBody)) {
        const validationResult = validateInput(parsedBody);
        return {
            statusCode: 422,
            body: JSON.stringify({ success: false, message: `Invalid field: ${validationResult}` })
        };
    }

    try {
        const newMessage = createMessage(parsedBody);

        await insertMessageToDB(newMessage);

        await publishMessageToTopic(newMessage);

        const response = {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: 'Message posted sucessfully.' })
        };

        console.log(`response from: ${path} statusCode: ${response.statusCode} body: ${response.body}`);
        return response;
    } catch (error) {
        console.log('Error while posting message.', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: 'Error while posting message.' })
        };
    }
};
