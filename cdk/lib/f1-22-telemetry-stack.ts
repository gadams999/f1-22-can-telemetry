/**
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"). You may not use
 * this file except in compliance with the License. A copy of the License is located at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS"
 * BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under the License.
 **/
import * as seedrandom from "seedrandom"
import * as path from "path"
import * as ec2 from "aws-cdk-lib/aws-ec2"
import * as s3 from "aws-cdk-lib/aws-s3"
import * as iam from "aws-cdk-lib/aws-iam"
import * as cdk from "aws-cdk-lib"
import { NagSuppressions } from "cdk-nag"
import { Construct } from "constructs"
import {
  AmazonLinuxGeneration,
  InstanceSize,
  InstanceType,
  SecurityGroup,
} from "aws-cdk-lib/aws-ec2"
import { Asset } from "aws-cdk-lib/aws-s3-assets"

export class F122TelemetryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    NagSuppressions.addStackSuppressions(this, [
      {
        id: "AwsSolutions-S1",
        reason:
          "Access to stack logging bucket does not require separate logging for demonstrations. For production, this should be addressed in all stack S3 buckets.",
      },
    ])

    const stackName = cdk.Stack.of(this).stackName
    const stackRandom: string = makeid(8, stackName)

    const logFileBucket = new s3.Bucket(this, "LogFileBucket", {
      bucketName: `${stackName}-logfiles-${cdk.Fn.ref(
        "AWS::AccountId"
      )}-${cdk.Fn.ref("AWS::Region")}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
      encryption: s3.BucketEncryption.S3_MANAGED,
      intelligentTieringConfigurations: [
        {
          name: "archive",
          archiveAccessTierTime: cdk.Duration.days(90),
          deepArchiveAccessTierTime: cdk.Duration.days(180),
        },
      ],
    })

    const vpcFlowLogRole = new iam.Role(this, "VpcFlowLogRole", {
      assumedBy: new iam.ServicePrincipal("vpc-flow-logs.amazonaws.com"),
    })
    logFileBucket.grantWrite(vpcFlowLogRole, "sharedVpcFlowLogs/*")
    NagSuppressions.addResourceSuppressions(
      vpcFlowLogRole,
      [
        {
          id: "AwsSolutions-IAM5",
          reason:
            "VPC Flow Logs are limited to the prefix 'sharedVpcFlowLogs' for writing to logFileBucket",
        },
      ],
      true
    )

    const vpc = new ec2.Vpc(this, "listenerVpc", {
      ipAddresses: ec2.IpAddresses.cidr("172.31.0.0/16"),
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "public-1",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    })

    // Create flow logs to S3
    new ec2.FlowLog(this, "SharedVpcFlowLogs", {
      destination: ec2.FlowLogDestination.toS3(
        logFileBucket,
        "sharedVpcFlowLogs/"
      ),
      trafficType: ec2.FlowLogTrafficType.ALL,
      flowLogName: "sharedVpcFlowLogs",
      resourceType: ec2.FlowLogResourceType.fromVpc(vpc),
    })

    // Create security group for instance
    const instanceSG = new ec2.SecurityGroup(this, "InstanceSG", {
      vpc,
      allowAllOutbound: true,
    })
    instanceSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow SSH access from anywhere"
    )
    NagSuppressions.addResourceSuppressions(
      instanceSG,
      [
        {
          id: "AwsSolutions-EC23",
          reason: "temporary until SSM access working",
        },
      ],
      true
    )

    // Create a role for the instance
    const instanceRole = new iam.Role(this, "InstanceRole", {
      roleName: "f1-telemetry-instance-profile",
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
      ],
    })
    NagSuppressions.addResourceSuppressions(
      instanceRole,
      [
        {
          id: "AwsSolutions-IAM4",
          reason: "Managed policies are adequate for SSM access",
        },
      ],
      true
    )

    // ec2 details for building
    // instance type: tg4.large
    // arch: Arm
    // AMI: ami-0efabcf945ffd8831
    const telemetryInstance = new ec2.Instance(this, "TelemetryInstance", {
      instanceName: "telemetry-instance",
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        // TODO - set to SMALL when done developing
        ec2.InstanceSize.MEDIUM
      ),
      // CDK error resolving from latestAmazonLinux, using SSM specific: https://github.com/aws/aws-cdk/issues/21011
      machineImage: ec2.MachineImage.fromSsmParameter(
        "/aws/service/ami-amazon-linux-latest/al2022-ami-kernel-default-arm64"
      ),
      // machineImage: ec2.MachineImage.latestAmazonLinux({
      //   generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2022,
      //   edition: ec2.AmazonLinuxEdition.STANDARD,
      //   cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      // }),
      blockDevices: [
        {
          deviceName: "/dev/sda1",
          volume: ec2.BlockDeviceVolume.ebs(20),
        },
      ],
      role: instanceRole,
      securityGroup: instanceSG,
      // TODO - remove once dev is done
      keyName: "gadams-us-west-2",
    })
    NagSuppressions.addResourceSuppressions(
      telemetryInstance,
      [
        {
          id: "AwsSolutions-EC28",
          reason: "Single short-lived instance",
        },
        {
          id: "AwsSolutions-EC29",
          reason: "Single short-lived instance",
        },
      ],
      true
    )

    // userData script - create assets, then download and run
    const userDataAssets = new Asset(this, "UserDataAssets", {
      path: path.join(__dirname, "..", "assets"),
    })
    userDataAssets.grantRead(instanceRole)
    telemetryInstance.userData.addS3DownloadCommand({
      bucket: userDataAssets.bucket,
      bucketKey: userDataAssets.s3ObjectKey,
      localFile: "/tmp/assets.zip",
    })
    // telemetry and supporting code
    const f1TelemetryAssets = new Asset(this, "F1TelemetryAssets", {
      path: path.join(__dirname, "..", "..", "f1telem"),
    })
    f1TelemetryAssets.grantRead(instanceRole)
    telemetryInstance.userData.addS3DownloadCommand({
      bucket: f1TelemetryAssets.bucket,
      bucketKey: f1TelemetryAssets.s3ObjectKey,
      localFile: "/tmp/f1telem.zip",
    })
    telemetryInstance.userData.addCommands(
      "set -xe",
      "cd /tmp",
      "unzip assets.zip",
      "unzip f1telem.zip -d f1telem",
      "cp init-instance /usr/share/init-instance",
      "chmod +x /usr/share/init-instance",
      "/usr/share/init-instance",
      "cp edge-software-deploy /home/ec2-user/edge-software-deploy",
      "chmod +x /home/ec2-user/edge-software-deploy",
      "sudo -H -u ec2-user /home/ec2-user/edge-software-deploy"
    )

    NagSuppressions.addResourceSuppressions(
      instanceRole,
      [
        {
          id: "AwsSolutions-IAM5",
          reason: "Limit asset bucket to read only, used to download assets",
        },
      ],
      true
    )

    function makeid(length: number, seed: string) {
      // Generate a n-length random value for each resource
      var result = ""
      var characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
      var charactersLength = characters.length
      seedrandom(seed, { global: true })
      for (var i = 0; i < length; i++) {
        result += characters.charAt(
          Math.floor(Math.random() * charactersLength)
        )
      }
      return result
    }
  }
}
