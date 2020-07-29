import * as apigateway from '@aws-cdk/aws-apigateway';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import * as sns from '@aws-cdk/aws-sns';
import { App, CfnParameter, Duration, Stack, StackProps } from '@aws-cdk/core';

export class CdkStack extends Stack {
    constructor(scope: App, id: string, props: StackProps) {
        super(scope, id, props);

        // eslint-disable-next-line no-new
        new CfnParameter(this, 'AppId');

        const table = new dynamodb.Table(this, 'T_MESSAGES', {
            partitionKey: { name: 'uuid', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: dynamodb.AttributeType.NUMBER },
            readCapacity: 2,
            writeCapacity: 2
        });

        table.addGlobalSecondaryIndex({
            indexName: 'username-gsi',
            partitionKey: { name: 'username', type: dynamodb.AttributeType.STRING },
            readCapacity: 2,
            writeCapacity: 2
        });

        const messagesTopic = new sns.Topic(this, 'SNS_MESSAGES', {
            displayName: 'Topic with new messages.'
        });

        const environment = {
            DYNAMODB_MESSAGES_TABLE: table.tableName,
            SNS_MESSAGE_TOPIC_ARN: messagesTopic.topicArn
        };

        const artifactBucket = s3.Bucket.fromBucketName(this, 'ArtifactBucket', process.env.S3_BUCKET!);
        const artifactKey = `${process.env.CODEBUILD_BUILD_ID}/function-code.zip`;
        const code = lambda.Code.fromBucket(artifactBucket, artifactKey);

        const getMessagesFromUserFunction = new lambda.Function(this, 'getMessagesFromUser', {
            description: 'Gets all messages from a user.',
            handler: 'lib/get-messages-from-user.getMessagesFromUserHandler',
            runtime: lambda.Runtime.NODEJS_10_X,
            code,
            environment,
            timeout: Duration.seconds(60)
        });

        table.grantReadData(getMessagesFromUserFunction);

        const postMessageFunction = new lambda.Function(this, 'postMessage', {
            description: 'Posts a message to DynamoDB table and posts a message to SNS topic.',
            handler: 'lib/post-message.postMessageHandler',
            runtime: lambda.Runtime.NODEJS_10_X,
            code,
            timeout: Duration.seconds(60),
            environment
        });

        table.grantReadWriteData(postMessageFunction);

        messagesTopic.grantPublish(postMessageFunction);

        const messagesApi = new apigateway.RestApi(this, 'MessagesApi', { cloudWatchRole: false });
        const messagesResource = messagesApi.root.addResource('messages');
        messagesResource.addMethod('POST', new apigateway.LambdaIntegration(postMessageFunction));
        messagesResource
            .addResource('user')
            .addResource('{username}')
            .addMethod('GET', new apigateway.LambdaIntegration(getMessagesFromUserFunction));
    }
}
