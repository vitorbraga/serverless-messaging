import dynamodb from 'aws-sdk/clients/dynamodb';
import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';

export const getMessagesFromUserHandler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
    const { httpMethod, path, pathParameters } = event;

    if (httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ success: false, message: `getMessagesFromUser only accepts GET method, you tried: ${httpMethod} method.` })
        };
    }

    if (!pathParameters || !pathParameters.username) {
        return {
            statusCode: 422,
            body: JSON.stringify({ success: false, message: 'Username cannot be empty.' })
        };
    }

    try {
        const tableName = process.env.DYNAMODB_MESSAGES_TABLE || 'T_MESSAGES';
        const docClient = new dynamodb.DocumentClient();

        const params = {
            TableName: tableName,
            IndexName: 'username-gsi',
            KeyConditionExpression: 'username = :username',
            ExpressionAttributeValues: { ':username': pathParameters.username }
        };

        const { Items } = await docClient.query(params).promise();

        const response = {
            statusCode: 200,
            body: JSON.stringify({ success: true, items: Items })
        };

        console.log(`response from: ${path} statusCode: ${response.statusCode} body: ${response.body}`);
        return response;
    } catch (error) {
        console.log('Error while searching messages from user.', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: 'Error while searching messages from user.' })
        };
    }
};
