#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/ffc36fa0597cee434d1f3cfe3f0344fef80a0af80ff8ed9c7821d116f50b70b9/contract';
import endContract from '../../snapshots/ffc36fa0597cee434d1f3cfe3f0344fef80a0af80ff8ed9c7821d116f50b70b9/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'Activity',
        columns: [
          col('activityType', 'text', {
            notNull: true,
            default: lit('GENERAL'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('approvalMode', 'text', {
            notNull: true,
            default: lit('AUTO'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('attendanceMode', 'text', {
            notNull: true,
            default: lit('OPEN_LINK'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('attendanceTokenHash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('committeeId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('createdById', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('individualPoints', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('needsApproval', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('publicId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('registrationEnd', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('registrationStart', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('requireAttendanceToken', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('seasonId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('startsAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('DRAFT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Activity_activityType_check_ac06b6a9',
            "\"activityType\" IN ('GENERAL', 'SPORTS', 'TALK', 'WORKSHOP', 'SOCIAL', 'OTHER')",
          ),
          checkExpression(
            'Activity_approvalMode_check_f4986587',
            "\"approvalMode\" IN ('AUTO', 'MANUAL')",
          ),
          checkExpression(
            'Activity_attendanceMode_check_03c32325',
            '"attendanceMode" IN (\'OPEN_LINK\')',
          ),
          checkExpression(
            'Activity_status_check_06bd9c3d',
            "\"status\" IN ('DRAFT', 'OPEN', 'CLOSED', 'PROCESSED', 'CANCELLED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'ActivityPublicIdHistory',
        columns: [
          col('activityId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('publicId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('retiredAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'AppConfig',
        columns: [
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('updatedById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('value', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Attendance',
        columns: [
          col('activityId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('approvedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('approvedById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('cancelReason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('cancelledAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('memberId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('registeredAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('source', 'text', {
            notNull: true,
            default: lit('LINK'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Attendance_source_check_9b2c7690',
            "\"source\" IN ('QR', 'LINK', 'ADMIN', 'IMPORT', 'MICROSOFT_FORMS')",
          ),
          checkExpression(
            'Attendance_status_check_57fe5f48',
            "\"status\" IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'AuditLog',
        columns: [
          col('action', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('actorId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('after', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('before', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('entityId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('entityType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ip', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'AuthChallenge',
        columns: [
          col('attempts', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('codeHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('consumedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ip', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('kind', 'text', {
            notNull: true,
            default: lit('OTP'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('maxAttempts', 'int4', {
            notNull: true,
            default: lit(5),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('AuthChallenge_kind_check_f6c16e61', "\"kind\" IN ('OTP', 'MAGIC_LINK')"),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Badge',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('description', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('slug', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Badge_type_check_d9306b4a',
            "\"type\" IN ('STREAK', 'POINTS', 'TOP', 'MVP', 'LEADER')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Committee',
        columns: [
          col('color', 'text', {
            notNull: true,
            default: lit('#1e3a5f'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('slug', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Committee_status_check_ee520df2',
            "\"status\" IN ('ACTIVE', 'INACTIVE')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'CommitteeActivityScore',
        columns: [
          col('activityId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('attendeeCredit', 'numeric', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('committeeId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('computedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('creditStrategy', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('eligibleMemberCount', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('frozen', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('participationRate', 'numeric', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('seasonId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'CommitteeActivityScore_creditStrategy_check_778f09b0',
            "\"creditStrategy\" IN ('FULL_CREDIT', 'FRACTIONAL_CREDIT')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'HallOfFameSeason',
        columns: [
          col('activeWinnerId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('committeeWinnerId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('newWinnerId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('seasonId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('stats', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('top3Active', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('top3Committees', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('top3New', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'IdentityAccount',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('lastLoginAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('memberId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('microsoftOid', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('microsoftTid', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('provider', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('providerUserId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'IdentityAccount_provider_check_db831ec5',
            "\"provider\" IN ('EMAIL_OTP', 'MICROSOFT_ENTRA')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'ImportJob',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('createdById', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('filename', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('summary', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Member',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('fullName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('institutionalEmail', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('memberType', 'text', {
            notNull: true,
            default: lit('NEW'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Member_memberType_check_dd93d282',
            "\"memberType\" IN ('NEW', 'ACTIVE')",
          ),
          checkExpression(
            'Member_status_check_64177b27',
            "\"status\" IN ('ACTIVE', 'ON_LEAVE', 'HONORARY', 'INACTIVE')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'MemberBadge',
        columns: [
          col('awardedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('badgeId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('memberId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('periodKey', 'text', {
            notNull: true,
            default: lit(''),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('seasonId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'MemberCommittee',
        columns: [
          col('committeeId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('isActive', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('joinedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('leftAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('memberId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'MemberRole',
        columns: [
          col('committeeId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('memberId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'MemberRole_role_check_dad004a6',
            "\"role\" IN ('MEMBER', 'COMMITTEE_LEADER', 'ADMIN')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'PointTransaction',
        columns: [
          col('activityId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('attendanceId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('createdById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('memberId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('points', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reversalOfId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('seasonId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'PointTransaction_type_check_eceeaca5',
            "\"type\" IN ('ACTIVITY', 'MANUAL_ADJUSTMENT', 'BONUS', 'PENALTY', 'REVERSAL')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Season',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('endDate', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('startDate', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('UPCOMING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Season_status_check_ef432205',
            "\"status\" IN ('UPCOMING', 'ACTIVE', 'CLOSED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Session',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ip', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('memberId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userAgent', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Activity',
        constraint: 'Activity_publicId_key',
        columns: ['publicId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'AppConfig',
        constraint: 'AppConfig_key_key',
        columns: ['key'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Attendance',
        constraint: 'Attendance_activityId_memberId_key',
        columns: ['activityId', 'memberId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Badge',
        constraint: 'Badge_slug_key',
        columns: ['slug'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Committee',
        constraint: 'Committee_slug_key',
        columns: ['slug'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'CommitteeActivityScore',
        constraint: 'CommitteeActivityScore_committeeId_activityId_key',
        columns: ['committeeId', 'activityId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'HallOfFameSeason',
        constraint: 'HallOfFameSeason_seasonId_key',
        columns: ['seasonId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'IdentityAccount',
        constraint: 'IdentityAccount_provider_providerUserId_key',
        columns: ['provider', 'providerUserId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Member',
        constraint: 'Member_institutionalEmail_key',
        columns: ['institutionalEmail'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'MemberBadge',
        constraint: 'MemberBadge_memberId_badgeId_seasonId_periodKey_key',
        columns: ['memberId', 'badgeId', 'seasonId', 'periodKey'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'PointTransaction',
        constraint: 'PointTransaction_reversalOfId_key',
        columns: ['reversalOfId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Session',
        constraint: 'Session_tokenHash_key',
        columns: ['tokenHash'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Activity',
        index: 'Activity_committeeId_idx_33d2c5b7',
        columns: ['committeeId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Activity',
        index: 'Activity_createdById_idx_8bf640ed',
        columns: ['createdById'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Activity',
        index: 'Activity_needsApproval_status_idx_24e3ffa3',
        columns: ['needsApproval', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Activity',
        index: 'Activity_seasonId_idx_aa50cbae',
        columns: ['seasonId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Activity',
        index: 'Activity_seasonId_status_idx_0da2dd50',
        columns: ['seasonId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Activity',
        index: 'Activity_startsAt_idx_5ff0df68',
        columns: ['startsAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Activity',
        index: 'Activity_status_registrationStart_registrationEnd_idx_0ed7eb9a',
        columns: ['status', 'registrationStart', 'registrationEnd'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ActivityPublicIdHistory',
        index: 'ActivityPublicIdHistory_activityId_idx_bf2a659e',
        columns: ['activityId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ActivityPublicIdHistory',
        index: 'ActivityPublicIdHistory_publicId_idx_0a02f14d',
        columns: ['publicId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AppConfig',
        index: 'AppConfig_updatedById_idx_d0517c24',
        columns: ['updatedById'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Attendance',
        index: 'Attendance_activityId_idx_bf2a659e',
        columns: ['activityId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Attendance',
        index: 'Attendance_activityId_status_idx_463c9b1a',
        columns: ['activityId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Attendance',
        index: 'Attendance_approvedById_idx_01ef8410',
        columns: ['approvedById'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Attendance',
        index: 'Attendance_memberId_idx_76b3c263',
        columns: ['memberId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AuditLog',
        index: 'AuditLog_actorId_idx_a58f6b4b',
        columns: ['actorId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AuditLog',
        index: 'AuditLog_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AuditLog',
        index: 'AuditLog_entityType_entityId_idx_ea0fa809',
        columns: ['entityType', 'entityId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AuthChallenge',
        index: 'AuthChallenge_email_createdAt_idx_6e3c0d8a',
        columns: ['email', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AuthChallenge',
        index: 'AuthChallenge_email_kind_consumedAt_idx_28281cd2',
        columns: ['email', 'kind', 'consumedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AuthChallenge',
        index: 'AuthChallenge_ip_createdAt_idx_ca2bb611',
        columns: ['ip', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Committee',
        index: 'Committee_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CommitteeActivityScore',
        index: 'CommitteeActivityScore_activityId_idx_bf2a659e',
        columns: ['activityId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CommitteeActivityScore',
        index: 'CommitteeActivityScore_committeeId_idx_33d2c5b7',
        columns: ['committeeId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CommitteeActivityScore',
        index: 'CommitteeActivityScore_seasonId_committeeId_idx_c38f9fb7',
        columns: ['seasonId', 'committeeId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'IdentityAccount',
        index: 'IdentityAccount_memberId_idx_76b3c263',
        columns: ['memberId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ImportJob',
        index: 'ImportJob_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ImportJob',
        index: 'ImportJob_createdById_idx_8bf640ed',
        columns: ['createdById'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Member',
        index: 'Member_fullName_idx_08c13ff8',
        columns: ['fullName'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Member',
        index: 'Member_status_memberType_idx_a1793e20',
        columns: ['status', 'memberType'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MemberBadge',
        index: 'MemberBadge_badgeId_idx_e78e6f52',
        columns: ['badgeId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MemberBadge',
        index: 'MemberBadge_memberId_idx_76b3c263',
        columns: ['memberId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MemberCommittee',
        index: 'MemberCommittee_committeeId_idx_33d2c5b7',
        columns: ['committeeId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MemberCommittee',
        index: 'MemberCommittee_committeeId_isActive_idx_e3350c08',
        columns: ['committeeId', 'isActive'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MemberCommittee',
        index: 'MemberCommittee_memberId_idx_76b3c263',
        columns: ['memberId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MemberCommittee',
        index: 'MemberCommittee_memberId_isActive_idx_ca3e92c2',
        columns: ['memberId', 'isActive'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MemberRole',
        index: 'MemberRole_committeeId_idx_33d2c5b7',
        columns: ['committeeId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MemberRole',
        index: 'MemberRole_memberId_idx_76b3c263',
        columns: ['memberId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MemberRole',
        index: 'MemberRole_memberId_role_idx_dde6faa1',
        columns: ['memberId', 'role'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MemberRole',
        index: 'MemberRole_role_idx_2c1ddf83',
        columns: ['role'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PointTransaction',
        index: 'PointTransaction_activityId_idx_bf2a659e',
        columns: ['activityId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PointTransaction',
        index: 'PointTransaction_attendanceId_idx_b259ff3f',
        columns: ['attendanceId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PointTransaction',
        index: 'PointTransaction_createdById_idx_8bf640ed',
        columns: ['createdById'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PointTransaction',
        index: 'PointTransaction_memberId_createdAt_idx_30d9f94b',
        columns: ['memberId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PointTransaction',
        index: 'PointTransaction_memberId_idx_76b3c263',
        columns: ['memberId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PointTransaction',
        index: 'PointTransaction_seasonId_createdAt_idx_642ced50',
        columns: ['seasonId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PointTransaction',
        index: 'PointTransaction_seasonId_idx_aa50cbae',
        columns: ['seasonId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PointTransaction',
        index: 'PointTransaction_seasonId_memberId_idx_218f3c51',
        columns: ['seasonId', 'memberId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Season',
        index: 'Season_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Session',
        index: 'Session_expiresAt_idx_6b6b8c10',
        columns: ['expiresAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Session',
        index: 'Session_memberId_idx_76b3c263',
        columns: ['memberId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Activity',
        foreignKey: {
          name: 'Activity_seasonId_fkey',
          columns: ['seasonId'],
          references: { schema: 'public', table: 'Season', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Activity',
        foreignKey: {
          name: 'Activity_committeeId_fkey',
          columns: ['committeeId'],
          references: { schema: 'public', table: 'Committee', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Activity',
        foreignKey: {
          name: 'Activity_createdById_fkey',
          columns: ['createdById'],
          references: { schema: 'public', table: 'Member', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ActivityPublicIdHistory',
        foreignKey: {
          name: 'ActivityPublicIdHistory_activityId_fkey',
          columns: ['activityId'],
          references: { schema: 'public', table: 'Activity', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AppConfig',
        foreignKey: {
          name: 'AppConfig_updatedById_fkey',
          columns: ['updatedById'],
          references: { schema: 'public', table: 'Member', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Attendance',
        foreignKey: {
          name: 'Attendance_activityId_fkey',
          columns: ['activityId'],
          references: { schema: 'public', table: 'Activity', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Attendance',
        foreignKey: {
          name: 'Attendance_memberId_fkey',
          columns: ['memberId'],
          references: { schema: 'public', table: 'Member', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Attendance',
        foreignKey: {
          name: 'Attendance_approvedById_fkey',
          columns: ['approvedById'],
          references: { schema: 'public', table: 'Member', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AuditLog',
        foreignKey: {
          name: 'AuditLog_actorId_fkey',
          columns: ['actorId'],
          references: { schema: 'public', table: 'Member', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'CommitteeActivityScore',
        foreignKey: {
          name: 'CommitteeActivityScore_committeeId_fkey',
          columns: ['committeeId'],
          references: { schema: 'public', table: 'Committee', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'CommitteeActivityScore',
        foreignKey: {
          name: 'CommitteeActivityScore_activityId_fkey',
          columns: ['activityId'],
          references: { schema: 'public', table: 'Activity', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'HallOfFameSeason',
        foreignKey: {
          name: 'HallOfFameSeason_seasonId_fkey',
          columns: ['seasonId'],
          references: { schema: 'public', table: 'Season', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'IdentityAccount',
        foreignKey: {
          name: 'IdentityAccount_memberId_fkey',
          columns: ['memberId'],
          references: { schema: 'public', table: 'Member', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ImportJob',
        foreignKey: {
          name: 'ImportJob_createdById_fkey',
          columns: ['createdById'],
          references: { schema: 'public', table: 'Member', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'MemberBadge',
        foreignKey: {
          name: 'MemberBadge_memberId_fkey',
          columns: ['memberId'],
          references: { schema: 'public', table: 'Member', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'MemberBadge',
        foreignKey: {
          name: 'MemberBadge_badgeId_fkey',
          columns: ['badgeId'],
          references: { schema: 'public', table: 'Badge', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'MemberCommittee',
        foreignKey: {
          name: 'MemberCommittee_memberId_fkey',
          columns: ['memberId'],
          references: { schema: 'public', table: 'Member', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'MemberCommittee',
        foreignKey: {
          name: 'MemberCommittee_committeeId_fkey',
          columns: ['committeeId'],
          references: { schema: 'public', table: 'Committee', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'MemberRole',
        foreignKey: {
          name: 'MemberRole_memberId_fkey',
          columns: ['memberId'],
          references: { schema: 'public', table: 'Member', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'MemberRole',
        foreignKey: {
          name: 'MemberRole_committeeId_fkey',
          columns: ['committeeId'],
          references: { schema: 'public', table: 'Committee', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PointTransaction',
        foreignKey: {
          name: 'PointTransaction_memberId_fkey',
          columns: ['memberId'],
          references: { schema: 'public', table: 'Member', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PointTransaction',
        foreignKey: {
          name: 'PointTransaction_seasonId_fkey',
          columns: ['seasonId'],
          references: { schema: 'public', table: 'Season', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PointTransaction',
        foreignKey: {
          name: 'PointTransaction_activityId_fkey',
          columns: ['activityId'],
          references: { schema: 'public', table: 'Activity', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PointTransaction',
        foreignKey: {
          name: 'PointTransaction_attendanceId_fkey',
          columns: ['attendanceId'],
          references: { schema: 'public', table: 'Attendance', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PointTransaction',
        foreignKey: {
          name: 'PointTransaction_createdById_fkey',
          columns: ['createdById'],
          references: { schema: 'public', table: 'Member', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PointTransaction',
        foreignKey: {
          name: 'PointTransaction_reversalOfId_fkey',
          columns: ['reversalOfId'],
          references: { schema: 'public', table: 'PointTransaction', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Session',
        foreignKey: {
          name: 'Session_memberId_fkey',
          columns: ['memberId'],
          references: { schema: 'public', table: 'Member', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
