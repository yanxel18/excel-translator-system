import { useState } from "react";
import { Anchor, Box, Button, Modal, SimpleGrid, Stack, Text } from "@mantine/core";
import { useLocale } from "../shared/LocaleProvider";
import "./TokenExplanation.css";

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
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Box className="token-example">
              <Text fw={700} size="sm">{t("English")}</Text>
              <div className="token-example-line"><code>Hello</code> → <code className="token-piece">Hello</code> (1)</div>
              <div className="token-example-line"><code>Hello</code> → <code className="token-piece">Hel</code> <code className="token-piece token-piece-alt">lo</code> (2)</div>
            </Box>
            <Box className="token-example">
              <Text fw={700} size="sm">{t("Japanese")}</Text>
              <div className="token-example-line"><code>こんにちは</code> → <code className="token-piece">こんにちは</code></div>
              <div className="token-example-line"><code>こんにちは</code> → <code className="token-piece">こん</code> <code className="token-piece token-piece-alt">にちは</code></div>
            </Box>
          </SimpleGrid>
          <Text>{t("For example, hypothetical model A could count Hello as 1 token and model B as 2. A real count requires that model's tokenizer.")}</Text>
          <Text fw={700}>{t("How this app estimates usage")}</Text>
          <Text>{t("For each file, selected input text and translated output text are measured separately. We add the UTF-8 bytes for each side, divide by 4, and round up once. Shared strings are counted once.")}</Text>
          <Box className="token-example token-calculation">
            <Text><code>Hello</code>: {t("5 UTF-8 bytes ÷ 4, rounded up = 2")}</Text>
            <Text><code>こんにちは</code>: {t("15 UTF-8 bytes ÷ 4, rounded up = 4")}</Text>
          </Box>
          <Text>{t("These text-only estimates are not actual model usage or billing. They exclude prompts and other request overhead, and do not depend on the selected model.")}</Text>
          <Button variant="default" onClick={() => setOpened(false)}>{t("Close")}</Button>
        </Stack>
      </Modal>
    </>
  );
}
