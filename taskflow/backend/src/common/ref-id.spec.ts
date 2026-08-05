import { Types } from 'mongoose';
import { refId } from './ref-id';
import { TaskSchema } from '../tasks/schemas/task.schema';
import { CommentSchema } from '../comments/schemas/comment.schema';
import { ProjectSchema } from '../projects/schemas/project.schema';

/**
 * Regression tests for the ref-id seam.
 *
 * Root cause being pinned: repository read methods populate refs (assignee,
 * author, owner, members) for display, but a POPULATED document's
 * `.toString()` returns util.inspect output — NOT the id. The old call sites
 * did `ref?._id?.toString() ?? ref?.toString()`, which silently produced
 * garbage ids for populated refs, and the unit mocks (using
 * `{ toString: () => id }`) masked it. The virtuals + refId() helper below
 * are the single seam that knows both shapes.
 */

/**
 * Invokes the first getter of a schema virtual with a fake `this`.
 *
 * Reaches into mongoose's VirtualType.getters internals rather than
 * building real documents (a populated ref can't be assigned to an ObjectId
 * path without a DB). Keep this pattern here so a future mongoose upgrade
 * knows why the assertion looks unusual.
 */
function invokeVirtual(
  schema: {
    virtual: (name: string) => { getters?: ((this: unknown) => unknown)[] };
  },
  name: string,
  self: unknown,
): unknown {
  const getter = schema.virtual(name).getters?.[0];
  if (!getter) throw new Error(`virtual ${name} has no getter`);
  return getter.call(self);
}

describe('refId()', () => {
  it('resolves a populated doc via its _id, ignoring its inspect-blob toString()', () => {
    const id = new Types.ObjectId();
    // Mirrors a populated UserDocument: `_id` plus a toString() that returns
    // util.inspect garbage, never the id.
    const populatedDoc = {
      _id: id,
      firstName: 'Hanna',
      toString: () => "{\n  _id: '507f…',\n  firstName: 'Hanna' }",
    };

    expect(refId(populatedDoc)).toBe(id.toString());
  });

  it('resolves a raw ObjectId (unpopulated create() path)', () => {
    const id = new Types.ObjectId();
    expect(refId(id)).toBe(id.toString());
  });

  it('returns null for null / undefined refs', () => {
    expect(refId(null)).toBeNull();
    expect(refId(undefined)).toBeNull();
  });

  it('passes through a plain string id unchanged', () => {
    expect(refId('507f1f77bcf86cd799439011')).toBe('507f1f77bcf86cd799439011');
  });
});

describe('schema virtuals', () => {
  it('Task.assigneeId resolves both populated and raw assignee shapes', () => {
    const populatedId = new Types.ObjectId();
    const rawId = new Types.ObjectId();

    expect(
      invokeVirtual(TaskSchema, 'assigneeId', {
        assignee: { _id: populatedId, toString: () => 'NOT AN ID' },
      }),
    ).toBe(populatedId.toString());
    expect(invokeVirtual(TaskSchema, 'assigneeId', { assignee: rawId })).toBe(
      rawId.toString(),
    );
    expect(
      invokeVirtual(TaskSchema, 'assigneeId', { assignee: null }),
    ).toBeNull();
  });

  it('Comment.authorId resolves both populated and raw author shapes', () => {
    const populatedId = new Types.ObjectId();
    const rawId = new Types.ObjectId();

    expect(
      invokeVirtual(CommentSchema, 'authorId', {
        author: { _id: populatedId, toString: () => 'NOT AN ID' },
      }),
    ).toBe(populatedId.toString());
    expect(invokeVirtual(CommentSchema, 'authorId', { author: rawId })).toBe(
      rawId.toString(),
    );
    expect(
      invokeVirtual(CommentSchema, 'authorId', { author: undefined }),
    ).toBeNull();
  });

  it('Project.ownerId and memberIds resolve populated members', () => {
    const ownerId = new Types.ObjectId();
    const memberIds = [new Types.ObjectId(), new Types.ObjectId()];

    expect(
      invokeVirtual(ProjectSchema, 'ownerId', { owner: { _id: ownerId } }),
    ).toBe(ownerId.toString());

    const members = memberIds.map((m) => ({ _id: m, toString: () => 'X' }));
    expect(invokeVirtual(ProjectSchema, 'memberIds', { members })).toEqual(
      memberIds.map((m) => m.toString()),
    );
  });
});
