import dynamodb from 'aws-sdk/clients/dynamodb';
import Sns from 'aws-sdk/clients/sns';
import * as uuid from 'uuid';
import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';

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

export const postMessageHandler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
    const { body, httpMethod, path } = event;
    const docClient = new dynamodb.DocumentClient();

    const tableName = process.env.DYNAMODB_MESSAGES_TABLE || 'MessagesTable';
    const topicArn = process.env.SNS_MESSAGE_TOPIC_ARN;

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

    // Making a simple validation
    const validationResult = validateInput(parsedBody);
    if (validationResult) {
        return {
            statusCode: 422,
            body: JSON.stringify({ success: false, message: `Invalid field: ${validationResult}` })
        };
    }

    try {
        // Create uuid for the new message
        const newUuid = uuid.v4();
        const createdAt = Date.now();

        // Will post a new message to DynamoDB
        const dynamoParams = {
            TableName: tableName,
            Item: {
                uuid: newUuid,
                title: parsedBody.title,
                description: parsedBody.description,
                username: parsedBody.username,
                createdAt
            }
        };
        await docClient.put(dynamoParams).promise();

        // Will publish a new message to SNS topic
        const snsParams = {
            Message: JSON.stringify(dynamoParams.Item),
            TopicArn: topicArn || 'SNS_MESSAGES'
        };
        const snsClient = new Sns();
        await snsClient.publish(snsParams).promise();

        // Everything went well, will send the success response to the user
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
