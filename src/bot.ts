import { Markup, Telegraf } from "telegraf"
import dotenv from "dotenv"
import { supabase } from "./supabase"
import axios from "axios"

dotenv.config()
const uploadState = new Map<number, boolean>()
const bot = new Telegraf(process.env.BOT_TOKEN!)

async function isAuthorized(telegramId: number) {
  const { data } = await supabase
    .from("students")
    .select("*")
    .eq("telegram_id", telegramId)
    .single()

  return !!data
}

async function showMainMenu(ctx: any) {
  await ctx.reply(
    "Главное меню",
    Markup.keyboard([
      ["📚 Материалы", "📝 Тесты"],
      ["📅 Расписание", "👨‍🏫 Инструкторы"],
      ["📞 Контакты"],
      ["🚪 Выйти"]
    ]).resize()
  )
}

bot.start(async (ctx) => {
  const ok = await isAuthorized(ctx.from.id)

  if (ok) {
    return showMainMenu(ctx)
  }

  await ctx.reply("Введите код доступа")
})

bot.on("text", async (ctx, next) => {
  const text = ctx.message.text

  const menuButtons = [
    "📚 Материалы",
    "📝 Тесты",
    "📅 Расписание",
    "👨‍🏫 Инструкторы",
    "📞 Контакты",
    "🚪 Выйти"
  ]

  if (menuButtons.includes(text)) {
    return next()
  }

  const authorized = await isAuthorized(ctx.from.id)

  if (authorized) {
    return next()
  }

  const { data } = await supabase
    .from("students")
    .select("*")
    .eq("access_code", text)
    .single()

  if (!data) {
    return ctx.reply("Неверный код")
  }

  await supabase
    .from("students")
    .update({
      telegram_id: ctx.from.id
    })
    .eq("id", data.id)

  await ctx.reply("Доступ открыт ✅")

  await showMainMenu(ctx)
})

bot.hears("📚 Материалы", async (ctx) => {
  if (!(await isAuthorized(ctx.from.id))) {
    return ctx.reply("Нет доступа")
  }

  const { data, error } = await supabase
    .from("materials")
    .select("*")

  if (error || !data?.length) {
    return ctx.reply("Материалы пока не добавлены")
  }

  let text = "📚 Доступные материалы:\n\n"

  data.forEach((item, index) => {
    text += `${index + 1}. ${item.title}\n${item.file_url}\n\n`
  })

  await ctx.reply(text)
})

bot.hears("📝 Тесты", async (ctx) => {
  if (!(await isAuthorized(ctx.from.id))) {
    return ctx.reply("Нет доступа")
  }

  await ctx.reply("Ссылка на тесты ПДД")
})

bot.hears("📅 Расписание", async (ctx) => {
  if (!(await isAuthorized(ctx.from.id))) {
    return ctx.reply("Нет доступа")
  }

  await ctx.reply("Расписание занятий")
})

bot.hears("👨‍🏫 Инструкторы", async (ctx) => {
  if (!(await isAuthorized(ctx.from.id))) {
    return ctx.reply("Нет доступа")
  }

  await ctx.reply("Список инструкторов")
})

bot.hears("📞 Контакты", async (ctx) => {
  if (!(await isAuthorized(ctx.from.id))) {
    return ctx.reply("Нет доступа")
  }

  await ctx.reply("Контакты автошколы")
})

bot.hears("🚪 Выйти", async (ctx) => {
  await supabase
    .from("students")
    .update({
      telegram_id: null
    })
    .eq("telegram_id", ctx.from.id)

  await ctx.reply(
    "Вы вышли из аккаунта.\nВведите код доступа:",
    Markup.removeKeyboard()
  )
})

bot.hears("📤 Загрузить материал", async (ctx) => {
  const admin = await isAdmin(ctx.from.id)

  if (!admin) {
    return ctx.reply("Нет доступа")
  }

  uploadState.set(ctx.from.id, true)

  await ctx.reply("Отправьте PDF файл")
})

bot.command("deleteaccount", async (ctx) => {
  await supabase
    .from("students")
    .update({
      telegram_id: null
    })
    .eq("telegram_id", ctx.from.id)

  await ctx.reply(
    "Аккаунт удален.\nВведите код доступа для повторного входа.",
    Markup.removeKeyboard()
  )
})

async function isAdmin(telegramId: number) {
  const { data } = await supabase
    .from("students")
    .select("is_admin")
    .eq("telegram_id", telegramId)
    .single()

  return data?.is_admin === true
}

bot.command("admin", async (ctx) => {
  const admin = await isAdmin(ctx.from.id)

  if (!admin) {
    return ctx.reply("Нет доступа")
  }

  await ctx.reply(
    "Админ меню",
    Markup.keyboard([
      ["📤 Загрузить материал"],
      ["📚 Материалы"],
      ["🚪 Выйти"]
    ]).resize()
  )
})

bot.on("document", async (ctx) => {
  const admin = await isAdmin(ctx.from.id)

  if (!admin) return

  if (!uploadState.get(ctx.from.id)) return

  try {
    const document = ctx.message.document

    const file = await ctx.telegram.getFile(document.file_id)

    if (!file.file_path) {
      return ctx.reply("Не удалось получить путь к файлу")
    }

    const telegramFileUrl =
      `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`

    const response = await axios.get(telegramFileUrl, {
      responseType: "arraybuffer"
    })

    const fileName =
      `${Date.now()}-${document.file_name}`

    const { error: uploadError } = await supabase.storage
      .from("materials")
      .upload(fileName, response.data, {
        contentType: document.mime_type || "application/pdf"
      })

    if (uploadError) {
      console.error(uploadError)
      return ctx.reply("Ошибка загрузки в Storage")
    }

    const { data } = supabase.storage
      .from("materials")
      .getPublicUrl(fileName)

    const { error: dbError } = await supabase
      .from("materials")
      .insert({
        title: document.file_name,
        file_url: data.publicUrl
      })

    if (dbError) {
      console.error(dbError)
      return ctx.reply("Файл загружен, но не записан в БД")
    }

    uploadState.delete(ctx.from.id)

    await ctx.reply(
      `✅ Материал успешно загружен\n\n${document.file_name}`
    )

  } catch (error) {
    console.error(error)
    await ctx.reply("Ошибка при обработке файла")
  }
})

bot.catch((err) => {
  console.error("Ошибка бота:", err)
})

bot.launch()

console.log("🚀 Bot started")
