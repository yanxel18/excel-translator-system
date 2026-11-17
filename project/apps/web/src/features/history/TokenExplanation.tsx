import { useState } from "react";
import { Anchor, Button, Modal, Stack, Text } from "@mantine/core";
import { useLocale } from "../shared/LocaleProvider";

export default function TokenExplanation() {
  const { t } = useLocale();
  const [opened, setOpened] = useState(false);

  return (
    <>
      {" "}
      <Anchor component="button" type="button" size="sm" onClick={() => setOpened(true)}>
        {t("Read more about tokens")}
      </Anchor>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={t("Understanding tokens")}
        closeButtonProps={{ "aria-label": t("Close") }}
        size="lg"
        centered
      >
        <Stack gap="sm">
          <Text>{t("Tokens are pieces of text: a character, part of a word, a word, or punctuation. Spaces and context can change the split.")}</Text>
          <Text>{t("Languages and models use different tokenizers, so the same text can have different counts. These invented examples illustrate possible splits, not actual model results:")}</Text>
          <Text><strong>{t("English")}</strong>: Hello → [Hello] (1) / [Hel] [lo] (2)</Text>
          <Text><strong>{t("Japanese")}</strong>: こんにちは → [こんにちは] / [こん] [にちは]</Text>
          <Text>{t("For example, hypothetical model A could count Hello as 1 token and model B as 2. A real count requires that model's tokenizer.")}</Text>
          <Text fw={700}>{t("How this app estimates usage")}</Text>
          <Text>{t("For each file, selected input text and translated output text are measured separately. We add the UTF-8 bytes for each side, divide by 4, and round up once. Shared strings are counted once.")}</Text>
          <Text>Hello: {t("5 UTF-8 bytes ÷ 4, rounded up = 2")}</Text>
          <Text>こんにちは: {t("15 UTF-8 bytes ÷ 4, rounded up = 4")}</Text>
          <Text>{t("These text-only estimates are not actual model usage or billing. They exclude prompts and other request overhead, and do not depend on the selected model.")}</Text>
          <Button variant="default" onClick={() => setOpened(false)}>{t("Close")}</Button>
        </Stack>
      </Modal>
    </>
  );
}
