const express = require('express');
const crypto = require('crypto');

const { paths } = require('../lib/dataPaths');
const { readJson, updateJson } = require('../lib/fileStore');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const MAX_MESSAGE_LENGTH = 1200;

const normalizeMessageText = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, MAX_MESSAGE_LENGTH);
};

const toTimestamp = (value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toUnreadCount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed);
};

const resolveVendorForUser = (user, vendors) => {
  if (!user || user.role !== 'vendor') {
    return null;
  }
  return vendors.find((entry) => entry.userId === user.id) || null;
};

const canAccessConversation = (user, vendorRecord, conversation) => {
  if (!user || !conversation) {
    return false;
  }
  if (user.role === 'customer') {
    return conversation.customerId === user.id;
  }
  if (user.role === 'vendor') {
    return Boolean(vendorRecord && conversation.vendorId === vendorRecord.id);
  }
  return false;
};

const toCustomerDisplayName = (customer) => {
  if (!customer) {
    return 'Customer';
  }
  const fullName = [customer.firstName, customer.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return fullName || customer.username || 'Customer';
};

const toVendorDisplayName = (vendor) => {
  if (!vendor) {
    return 'Farmer';
  }
  return vendor.farmName || vendor.displayName || 'Farmer';
};

const toSummaryParticipant = (currentUser, conversation, usersById, vendorsById) => {
  if (currentUser.role === 'customer') {
    const vendor = vendorsById.get(conversation.vendorId) || null;
    return {
      role: 'vendor',
      vendorId: conversation.vendorId || null,
      userId: vendor?.userId || null,
      title: toVendorDisplayName(vendor),
      subtitle: [vendor?.city, vendor?.county].filter(Boolean).join(', '),
      phoneNumber: vendor?.phoneNumber || '',
      email: vendor?.email || '',
    };
  }

  const customer = usersById.get(conversation.customerId) || null;
  return {
    role: 'customer',
    vendorId: null,
    userId: conversation.customerId || null,
    title: toCustomerDisplayName(customer),
    subtitle: [customer?.city, customer?.county, customer?.country]
      .filter(Boolean)
      .join(', '),
    phoneNumber: customer?.phoneNumber || '',
    email: customer?.email || '',
  };
};

const toConversationSummary = (currentUser, conversation, usersById, vendorsById) => {
  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const lastMessage = messages[messages.length - 1] || null;
  const lastMessageAt =
    lastMessage?.createdAt || conversation.updatedAt || conversation.createdAt || null;

  return {
    id: conversation.id,
    vendorId: conversation.vendorId,
    customerId: conversation.customerId,
    createdAt: conversation.createdAt || null,
    updatedAt: conversation.updatedAt || null,
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          senderId: lastMessage.senderId,
          text: lastMessage.text,
          createdAt: lastMessage.createdAt,
        }
      : null,
    lastMessageAt,
    unreadCount:
      currentUser.role === 'customer'
        ? toUnreadCount(conversation.unreadForCustomer)
        : toUnreadCount(conversation.unreadForVendor),
    participant: toSummaryParticipant(
      currentUser,
      conversation,
      usersById,
      vendorsById,
    ),
  };
};

const toConversationDetails = (
  currentUser,
  conversation,
  usersById,
  vendorsById,
) => {
  const vendor = vendorsById.get(conversation.vendorId) || null;
  const customer = usersById.get(conversation.customerId) || null;
  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];

  return {
    ...toConversationSummary(currentUser, conversation, usersById, vendorsById),
    messages: messages.map((message) => {
      const sender =
        message.senderId === conversation.customerId ? customer : usersById.get(vendor?.userId);
      const senderRole =
        message.senderId === conversation.customerId ? 'customer' : 'vendor';
      const senderName =
        senderRole === 'customer'
          ? toCustomerDisplayName(customer)
          : toVendorDisplayName(vendor);

      return {
        id: message.id,
        senderId: message.senderId,
        senderRole,
        senderName,
        text: message.text,
        createdAt: message.createdAt,
      };
    }),
  };
};

router.get('/conversations', requireAuth, async (req, res, next) => {
  try {
    const chatsData = await readJson(paths.chats, { conversations: [] });
    const usersData = await readJson(paths.users, { users: [] });
    const vendorsData = await readJson(paths.vendors, { vendors: [] });

    const conversations = Array.isArray(chatsData.conversations)
      ? chatsData.conversations
      : [];
    const users = Array.isArray(usersData.users) ? usersData.users : [];
    const vendors = Array.isArray(vendorsData.vendors) ? vendorsData.vendors : [];

    const currentVendor = resolveVendorForUser(req.user, vendors);
    const userConversations = conversations.filter((conversation) =>
      canAccessConversation(req.user, currentVendor, conversation),
    );

    const usersById = new Map(users.map((user) => [user.id, user]));
    const vendorsById = new Map(vendors.map((vendor) => [vendor.id, vendor]));

    const summaries = userConversations
      .map((conversation) =>
        toConversationSummary(req.user, conversation, usersById, vendorsById),
      )
      .sort((a, b) => toTimestamp(b.lastMessageAt) - toTimestamp(a.lastMessageAt));

    const totalUnread = summaries.reduce(
      (sum, conversation) => sum + toUnreadCount(conversation.unreadCount),
      0,
    );

    return res.json({
      conversations: summaries,
      vendorId: currentVendor?.id || null,
      totalUnread,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/conversations/start', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({
        error: 'Only customer accounts can start a new conversation from farm pages.',
      });
    }

    const { vendorId } = req.body || {};
    if (!vendorId || typeof vendorId !== 'string') {
      return res.status(400).json({ error: 'vendorId is required.' });
    }

    const vendorsData = await readJson(paths.vendors, { vendors: [] });
    const vendors = Array.isArray(vendorsData.vendors) ? vendorsData.vendors : [];
    const vendor = vendors.find((entry) => entry.id === vendorId);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found.' });
    }

    const conversation = await updateJson(paths.chats, { conversations: [] }, (data) => {
      const conversations = Array.isArray(data.conversations)
        ? data.conversations
        : [];
      const existing = conversations.find(
        (entry) =>
          entry.vendorId === vendorId && entry.customerId === req.user.id,
      );
      if (existing) {
        return { data: { conversations }, result: existing };
      }

      const now = new Date().toISOString();
      const created = {
        id: crypto.randomUUID(),
        vendorId,
        customerId: req.user.id,
        createdAt: now,
        updatedAt: now,
        unreadForCustomer: 0,
        unreadForVendor: 0,
        messages: [],
      };
      conversations.push(created);
      return { data: { conversations }, result: created };
    });

    const usersData = await readJson(paths.users, { users: [] });
    const users = Array.isArray(usersData.users) ? usersData.users : [];
    const usersById = new Map(users.map((user) => [user.id, user]));
    const vendorsById = new Map(vendors.map((entry) => [entry.id, entry]));

    return res.status(201).json({
      conversation: toConversationSummary(
        req.user,
        conversation,
        usersById,
        vendorsById,
      ),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/conversations/:conversationId', requireAuth, async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required.' });
    }

    const chatsData = await readJson(paths.chats, { conversations: [] });
    const conversations = Array.isArray(chatsData.conversations)
      ? chatsData.conversations
      : [];
    const conversation =
      conversations.find((entry) => entry.id === conversationId) || null;
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    const usersData = await readJson(paths.users, { users: [] });
    const vendorsData = await readJson(paths.vendors, { vendors: [] });
    const users = Array.isArray(usersData.users) ? usersData.users : [];
    const vendors = Array.isArray(vendorsData.vendors) ? vendorsData.vendors : [];
    const currentVendor = resolveVendorForUser(req.user, vendors);
    if (!canAccessConversation(req.user, currentVendor, conversation)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const unreadField =
      req.user.role === 'customer' ? 'unreadForCustomer' : 'unreadForVendor';

    const updatedConversation = await updateJson(
      paths.chats,
      { conversations: [] },
      (data) => {
        const list = Array.isArray(data.conversations) ? data.conversations : [];
        let result = null;
        const nextConversations = list.map((entry) => {
          if (entry.id !== conversationId) {
            return entry;
          }
          const nextEntry = {
            ...entry,
            [unreadField]: 0,
          };
          result = nextEntry;
          return nextEntry;
        });
        return { data: { conversations: nextConversations }, result };
      },
    );

    const usersById = new Map(users.map((entry) => [entry.id, entry]));
    const vendorsById = new Map(vendors.map((entry) => [entry.id, entry]));
    return res.json({
      conversation: toConversationDetails(
        req.user,
        updatedConversation || conversation,
        usersById,
        vendorsById,
      ),
    });
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/conversations/:conversationId/messages',
  requireAuth,
  async (req, res, next) => {
    try {
      const { conversationId } = req.params;
      if (!conversationId) {
        return res.status(400).json({ error: 'conversationId is required.' });
      }

      const text = normalizeMessageText(req.body?.text);
      if (!text) {
        return res.status(400).json({ error: 'Message text is required.' });
      }

      const chatsData = await readJson(paths.chats, { conversations: [] });
      const conversations = Array.isArray(chatsData.conversations)
        ? chatsData.conversations
        : [];
      const currentConversation =
        conversations.find((entry) => entry.id === conversationId) || null;
      if (!currentConversation) {
        return res.status(404).json({ error: 'Conversation not found.' });
      }

      const vendorsData = await readJson(paths.vendors, { vendors: [] });
      const vendors = Array.isArray(vendorsData.vendors) ? vendorsData.vendors : [];
      const currentVendor = resolveVendorForUser(req.user, vendors);
      if (!canAccessConversation(req.user, currentVendor, currentConversation)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const now = new Date().toISOString();
      const message = {
        id: crypto.randomUUID(),
        senderId: req.user.id,
        text,
        createdAt: now,
      };

      await updateJson(paths.chats, { conversations: [] }, (data) => {
        const list = Array.isArray(data.conversations) ? data.conversations : [];
        const nextConversations = list.map((entry) => {
          if (entry.id !== conversationId) {
            return entry;
          }
          const messages = Array.isArray(entry.messages) ? entry.messages : [];
          const unreadForCustomer = toUnreadCount(entry.unreadForCustomer);
          const unreadForVendor = toUnreadCount(entry.unreadForVendor);
          const isCustomerSender = req.user.role === 'customer';
          return {
            ...entry,
            messages: [...messages, message],
            updatedAt: now,
            unreadForCustomer: isCustomerSender ? 0 : unreadForCustomer + 1,
            unreadForVendor: isCustomerSender ? unreadForVendor + 1 : 0,
          };
        });
        return { data: { conversations: nextConversations }, result: null };
      });

      return res.status(201).json({ message });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
