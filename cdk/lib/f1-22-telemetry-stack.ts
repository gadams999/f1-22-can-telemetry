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
import * as timestream from "aws-cdk-lib/aws-timestream"
import * as cdk from "aws-cdk-lib"
import { Fn } from "aws-cdk-lib"
import { NagSuppressions } from "cdk-nag"
import { Construct } from "constructs"
import { IotThingCertPolicy } from "../../cdk-constructs/IotThingCertPolicy"
import { Asset } from "aws-cdk-lib/aws-s3-assets"
import * as constants from "./constants"

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
    if (stackName.length > 20) {
      console.error("Stack name must be less than 20 characters in length")
      process.exitCode = 1
    }
    const stackRandom: string = makeid(8, stackName)

    // Create AWS IoT thing/cert/policy
    const fleetWiseCoreThingName = fullResourceName({
      stackName: stackName,
      baseName: "f1-car-core",
      suffix: stackRandom,
      resourceRegex: "a-zA-Z0-9:_-",
      maxLength: 128,
    })
    const fleetWiseCoreIotPolicyName = fullResourceName({
      stackName: stackName,
      baseName: "f1-car-minimal-policy",
      suffix: stackRandom,
      resourceRegex: "\\w+=,.@-",
      maxLength: 128,
    })
    // Then create IoT thing, certificate/private key, and IoT Policy
    const iotThingCertPol = new IotThingCertPolicy(this, "FleetWiseTestCore", {
      thingName: fleetWiseCoreThingName,
      iotPolicyName: fleetWiseCoreIotPolicyName,
      iotPolicy: constants.fleetWiseMinimalIoTPolicy,
      encryptionAlgorithm: "RSA",
      policyParameterMapping: {
        region: cdk.Fn.ref("AWS::Region"),
        account: cdk.Fn.ref("AWS::AccountId"),
      },
    })

    // Create timestream DB for use by FleetWise
    const tsDatabase = new timestream.CfnDatabase(this, "TsDatabase", {
      databaseName: `f1-telemetry-${stackRandom}`,
    })
    const tsHeartBeatTable = new timestream.CfnTable(this, "HeartbeatTable", {
      databaseName: tsDatabase.ref,
      tableName: "fleetwise",
      retentionProperties: {
        MemoryStoreRetentionPeriodInHours: "24",
        MagneticStoreRetentionPeriodInDays: "2",
      },
    })

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
    const vpcFlowLogs = new ec2.FlowLog(this, "SharedVpcFlowLogs", {
      destination: ec2.FlowLogDestination.toS3(
        logFileBucket,
        "sharedVpcFlowLogs/"
      ),
      trafficType: ec2.FlowLogTrafficType.ALL,
      flowLogName: "sharedVpcFlowLogs",
      resourceType: ec2.FlowLogResourceType.fromVpc(vpc),
    }).node.addDependency(vpcFlowLogRole)
    // Create security group for instance
    const instanceSG = new ec2.SecurityGroup(this, "InstanceSG", {
      vpc,
      allowAllOutbound: true,
    })
    // TODO - remove SSH access once development is done
    instanceSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow SSH access from anywhere"
    )
    instanceSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.udp(22222),
      "Allow UDP for telemetry listener from anywhere"
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
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:DescribeParameters"],
        resources: ["*"],
      })
    )
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameters"],
        resources: [
          `arn:aws:ssm:${cdk.Fn.ref("AWS::Region")}:${cdk.Fn.ref(
            "AWS::AccountId"
          )}:parameter/${stackName}/${fleetWiseCoreThingName}/*`,
        ],
      })
    )

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
        ec2.InstanceSize.XLARGE
      ),
      // CDK error resolving from latestAmazonLinux, using SSM specific: https://github.com/aws/aws-cdk/issues/21011
      machineImage: ec2.MachineImage.fromSsmParameter(
        "/aws/service/canonical/ubuntu/server/22.04/stable/current/arm64/hvm/ebs-gp2/ami-id"
      ),
      // machineImage: ec2.MachineImage.latestAmazonLinux({
      //   generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2022,
      //   edition: ec2.AmazonLinuxEdition.STANDARD,
      //   cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      // }),
      blockDevices: [
        {
          deviceName: "/dev/sda1",
          volume: ec2.BlockDeviceVolume.ebs(40),
        },
      ],
      role: instanceRole,
      securityGroup: instanceSG,
      // TODO - remove once dev is done
      keyName: "gadams-us-east-1",
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

    // telemetry and supporting code
    const f1TelemetryAssets = new Asset(this, "F1TelemetryAssets", {
      path: path.join(__dirname, "..", "..", "f1telem"),
    })
    f1TelemetryAssets.grantRead(instanceRole)

    telemetryInstance.userData.addCommands(
      "set -xe",
      `export STACK_NAME="${Fn.ref("AWS::StackName")}"`,
      `export REGION="${Fn.ref("AWS::Region")}"`,
      "export INSTANCE_NAME=TelemetryInstance",
      `export SSM_CERT="${iotThingCertPol.certificatePemParameter}"`,
      `export SSM_KEY="${iotThingCertPol.privateKeySecretParameter}"`,
      `export SSM_IOT_ENDPOINT="${iotThingCertPol.dataAtsEndpointAddress}"`,
      "apt update && DEBIAN_FRONTEND=noninteractive apt -y upgrade",
      "DEBIAN_FRONTEND=noninteractive apt install -y awscli zip unzip"
    )
    telemetryInstance.userData.addS3DownloadCommand({
      bucket: userDataAssets.bucket,
      bucketKey: userDataAssets.s3ObjectKey,
      localFile: "/tmp/assets.zip",
    })
    telemetryInstance.userData.addS3DownloadCommand({
      bucket: f1TelemetryAssets.bucket,
      bucketKey: f1TelemetryAssets.s3ObjectKey,
      localFile: "/tmp/f1telem.zip",
    })
    telemetryInstance.userData.addCommands(
      "cd /tmp",
      "unzip assets.zip",
      // "unzip f1telem.zip -d f1telem",
      "cp init-instance /usr/share/init-instance",
      "chmod +x /usr/share/init-instance",
      "/usr/share/init-instance",
      "cp edge-software-deploy /home/ubuntu/edge-software-deploy",
      "chmod +x /home/ubuntu/edge-software-deploy",
      "sudo -H -u ubuntu REGION=$REGION SSM_CERT=$SSM_CERT SSM_KEY=$SSM_KEY SSM_IOT_ENDPOINT=$SSM_IOT_ENDPOINT /home/ubuntu/edge-software-deploy"
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

    interface ResourceName {
      stackName: string
      baseName: string
      suffix: string
      resourceRegex: string
      maxLength: number
    }

    function fullResourceName({
      stackName,
      baseName,
      suffix,
      resourceRegex,
      maxLength,
    }: ResourceName) {
      let re = new RegExp(`[^\\[${resourceRegex}]`, "g")
      let resourceName = `${stackName}-${baseName}`.replace(re, "")
      resourceName = resourceName.substring(0, maxLength - suffix.length - 1)
      resourceName = `${resourceName}-${suffix}`
      return resourceName
    }
  }
}
