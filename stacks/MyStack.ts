import * as sst from "@serverless-stack/resources";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";

export default class MyStack extends sst.Stack {
  constructor(scope: sst.App, id: string, props?: sst.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "VPC", {
      cidr: "192.168.0.0/24",
      subnetConfiguration: [
        {
          cidrMask: 28,
          name: 'ecs',
          subnetType: ec2.SubnetType.PUBLIC,
        }
      ]
    });

    // Create an ECS cluster
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
    });

    const asgSecurityGroup = new ec2.SecurityGroup(this, 'asg-sg', {
        vpc
    });
    // ToDo: point to LB instead of anyIPv4
    asgSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Accept trafic from LB');

    const autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'ASG', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      securityGroup: asgSecurityGroup,
      minCapacity: 0,
      maxCapacity: 2,
    });

    const capacityProvider = new ecs.AsgCapacityProvider(this, 'AsgCapacityProvider', {
      autoScalingGroup,
    });

    cluster.addAsgCapacityProvider(capacityProvider);

    const logging = new ecs.AwsLogDriver({ streamPrefix: "Logs" });

    const repository = ecr.Repository.fromRepositoryName(this, 'albedo-image-repository', 'albedo');

    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'TaskDef', {
      networkMode: ecs.NetworkMode.BRIDGE
    });
    // taskDefinition.addVolume({
    //   name: 'AlbedoData',
    //   efsVolumeConfiguration: {
    //     fileSystemId: 'fs-1c58ff28',
    //     rootDirectory: '/albedo',
    //     transitEncryption: 'ENABLED'
    //   }
    // });

    taskDefinition.addContainer('DefaultContainer', {
      image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
      memoryReservationMiB: 258,
      memoryLimitMiB: 1024,
      portMappings: [{ hostPort: 80, containerPort: 8080, protocol: ecs.Protocol.TCP }],
      logging
    });

    // Instantiate an Amazon ECS Service
    const ecsService = new ecs.Ec2Service(this, 'Service', {
      cluster,
      taskDefinition,
      capacityProviderStrategies: [
        {
          capacityProvider: capacityProvider.capacityProviderName,
          weight: 1,
        },
      ]
    });

    // Show the endpoint in the output
    this.addOutputs({
      "hello": "world",
      "region": scope.region
    });
  }
}
